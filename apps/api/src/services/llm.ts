import { EventEmitter } from 'events';
import { UNTRUSTED_CONTEXT_NOTICE } from './prompt-safety';

// LLM Service Configuration
export interface LLMConfig {
  tier1: {
    endpoint: string;
    models: {
      fast: string;      // Quick responses, simple tasks
      balanced: string;  // General purpose
      quality: string;   // Complex reasoning
    };
    timeout: number;
    // Context window (num_ctx) requested per call. Ollama's server-side
    // default is tiny (measured ~2048 on prod, 2026-08-06) and it silently
    // truncates any prompt that exceeds it — the summary prompt (~3.4k
    // tokens) was losing its head every time. Must comfortably exceed the
    // largest prompt + num_predict.
    //
    // This value is also a COORDINATION value, not just a ceiling. The Ollama
    // host is shared with MOSS.AO, and for a given model name it keeps ONE
    // runner: a request at a num_ctx other than the resident one replaces it,
    // forcing a full unload/reload. Both services must therefore request the
    // SAME number or each alternation costs a reload. Do not change it
    // unilaterally. (Distinct models do coexist and run in parallel — it is
    // only same-model/different-options that thrashes.)
    numCtx: number;
  };
  tier2: {
    anthropic?: {
      apiKey: string;
      model: string;
    };
    openai?: {
      apiKey: string;
      model: string;
    };
    gemini?: {
      apiKey: string;
      model: string;
    };
  };
}

export type ModelComplexity = 'fast' | 'balanced' | 'quality';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  tier?: 0 | 1 | 2;
  complexity?: ModelComplexity; // Model selection hint
}

export interface LLMResponse {
  content: string;
  tier: 0 | 1 | 2;
  model: string;
  tokensUsed?: number;
  latencyMs: number;
}

// Thermal throttling configuration
interface ThermalThrottleConfig {
  minCooldownMs: number;        // Minimum delay between Tier 1 calls
  maxCallsPerMinute: number;    // Maximum Tier 1 calls per minute
  dynamicCooldown: boolean;     // Increase cooldown under heavy load
  maxCooldownMs: number;        // Maximum cooldown when under heavy load
}

interface QueuedRequest {
  request: LLMRequest;
  resolve: (response: LLMResponse) => void;
  reject: (error: Error) => void;
}

export class BudgetExceededError extends Error {
  constructor(public readonly provider: string) {
    super(`Daily budget exceeded for ${provider}`);
    this.name = 'BudgetExceededError';
  }
}

export type BudgetChecker = (provider: 'anthropic' | 'openai' | 'google') => boolean;

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private tier1Available: boolean = false;
  private budgetChecker: BudgetChecker | null = null;
  // When true, Tier 2 (paid APIs) are completely disabled — every request must
  // go through the local Ollama endpoint. Toggle via LLM_DISABLE_TIER2=true.
  private readonly disableTier2: boolean;
  // Number of attempts against Tier 1 before failing. Each retry doubles the
  // backoff, so default 3 = ~3+6+12s tail latency under bad ollama conditions.
  private readonly tier1MaxAttempts: number;
  private readonly tier1RetryBackoffMs: number;
  // Periodic re-check so a transiently-down Ollama recovers without a restart.
  private tier1RecheckTimer: NodeJS.Timeout | null = null;

  // Thermal throttling state
  private thermalConfig: ThermalThrottleConfig;
  private lastTier1CallTime: number = 0;
  private tier1CallTimestamps: number[] = [];
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue: boolean = false;
  private consecutiveCalls: number = 0;

  constructor() {
    super();

    this.disableTier2 = process.env.LLM_DISABLE_TIER2 === 'true';
    // 5 attempts × 2s/4s/8s/16s backoff = ~30s of total retry window before
    // giving up. Earlier 3 attempts could miss a 60s cold-load scenario.
    this.tier1MaxAttempts = Math.max(1, parseInt(process.env.LLM_TIER1_MAX_ATTEMPTS || '5', 10));
    this.tier1RetryBackoffMs = parseInt(process.env.LLM_TIER1_RETRY_BACKOFF_MS || '2000', 10);

    // Thermal throttling configuration (configurable via env vars)
    // Settings optimized for server cooling - longer cooldowns to reduce heat
    this.thermalConfig = {
      minCooldownMs: parseInt(process.env.LLM_MIN_COOLDOWN_MS || '5000', 10),         // 5s min between calls (was 2s)
      maxCallsPerMinute: parseInt(process.env.LLM_MAX_CALLS_PER_MINUTE || '8', 10),   // 8 calls/min max (was 15)
      dynamicCooldown: process.env.LLM_DYNAMIC_COOLDOWN !== 'false',                  // Enable by default
      maxCooldownMs: parseInt(process.env.LLM_MAX_COOLDOWN_MS || '30000', 10),        // 30s max cooldown (was 10s)
    };

    console.log(`[LLM] Thermal throttling enabled: min cooldown ${this.thermalConfig.minCooldownMs}ms, max ${this.thermalConfig.maxCallsPerMinute} calls/min`);
    if (this.disableTier2) {
      console.log('[LLM] Tier 2 (paid APIs) DISABLED — all requests routed to Ollama');
    }

    const tier2Enabled = !this.disableTier2;
    this.config = {
      tier1: {
        endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
        models: {
          fast: process.env.LOCAL_LLM_MODEL_FAST || 'gemma3:4b',
          balanced: process.env.LOCAL_LLM_MODEL_BALANCED || 'gemma3:4b',
          quality: process.env.LOCAL_LLM_MODEL_QUALITY || 'gemma3:4b',
        },
        timeout: parseInt(process.env.LLM_TIER1_TIMEOUT_MS || '180000', 10), // 3 min default
        // 16384 is the value agreed with MOSS.AO for the shared host (see the
        // coordination note on LLMConfig.tier1.numCtx). It costs us nothing:
        // measured on the serving host, gemma3:4b resident at 16384 reports
        // 2.89 GB VRAM vs 3.03 GB at 8192 — sliding-window attention keeps the
        // KV cache flat — and decode time scales with tokens actually emitted
        // (ours are 19–27), not with the window. Our largest real prompt is
        // ~4.5k tokens, so 8192 was already sufficient on headroom alone.
        numCtx: parseInt(process.env.LOCAL_LLM_NUM_CTX || '16384', 10),
      },
      tier2: {
        // Model ids are env-configurable: the previous hard-coded
        // claude-3-haiku-20240307 was retired 2026-04-19, so every Anthropic
        // call would have 404'd and fallen silently through the provider
        // chain the moment Tier 2 was switched on.
        anthropic: tier2Enabled && process.env.ANTHROPIC_API_KEY
          ? {
              apiKey: process.env.ANTHROPIC_API_KEY,
              model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
            }
          : undefined,
        openai: tier2Enabled && process.env.OPENAI_API_KEY
          ? {
              apiKey: process.env.OPENAI_API_KEY,
              model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
            }
          : undefined,
        gemini: tier2Enabled && process.env.GOOGLE_AI_API_KEY
          ? {
              apiKey: process.env.GOOGLE_AI_API_KEY,
              model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash',
            }
          : undefined,
      },
    };

    this.checkTier1Availability();
    // Re-probe ollama every minute so a transient outage (model loading, restart)
    // doesn't permanently flip tier1Available to false.
    this.tier1RecheckTimer = setInterval(() => {
      this.checkTier1Availability().catch(() => { /* logged inside */ });
    }, 60000);
    if (typeof this.tier1RecheckTimer.unref === 'function') this.tier1RecheckTimer.unref();
  }

  private async checkTier1Availability(): Promise<void> {
    try {
      const response = await fetch(`${this.config.tier1.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as { models?: { name: string }[] };
        this.tier1Available = (data.models?.length ?? 0) > 0;
        console.log(
          `[LLM] Tier 1 (Ollama) ${this.tier1Available ? 'available' : 'no models found'}`
        );
        if (this.tier1Available && data.models) {
          console.log(`[LLM] Available models: ${data.models.map((m) => m.name).join(', ')}`);
        }
      }
    } catch (error) {
      this.tier1Available = false;
      console.log('[LLM] Tier 1 (Ollama) not available - using Tier 2 fallback');
    }
  }

  /**
   * Calculate current cooldown based on load
   */
  private calculateCooldown(): number {
    if (!this.thermalConfig.dynamicCooldown) {
      return this.thermalConfig.minCooldownMs;
    }

    // Increase cooldown based on consecutive calls
    const loadFactor = Math.min(this.consecutiveCalls / 5, 3); // Max 3x multiplier
    const cooldown = Math.min(
      this.thermalConfig.minCooldownMs * (1 + loadFactor),
      this.thermalConfig.maxCooldownMs
    );

    return Math.round(cooldown);
  }

  /**
   * Check if we're within rate limits for Tier 1
   */
  private canCallTier1(): { allowed: boolean; waitMs: number } {
    const now = Date.now();

    // Clean old timestamps (older than 1 minute)
    this.tier1CallTimestamps = this.tier1CallTimestamps.filter(
      ts => now - ts < 60000
    );

    // Check rate limit
    if (this.tier1CallTimestamps.length >= this.thermalConfig.maxCallsPerMinute) {
      const oldestCall = this.tier1CallTimestamps[0];
      const waitMs = 60000 - (now - oldestCall);
      return { allowed: false, waitMs: Math.max(waitMs, 1000) };
    }

    // Check cooldown since last call
    const timeSinceLastCall = now - this.lastTier1CallTime;
    const requiredCooldown = this.calculateCooldown();

    if (timeSinceLastCall < requiredCooldown) {
      const waitMs = requiredCooldown - timeSinceLastCall;
      return { allowed: false, waitMs };
    }

    return { allowed: true, waitMs: 0 };
  }

  /**
   * Record a Tier 1 call for throttling tracking
   */
  private recordTier1Call(): void {
    const now = Date.now();
    this.lastTier1CallTime = now;
    this.tier1CallTimestamps.push(now);
    this.consecutiveCalls++;

    // Decay consecutive calls counter over time
    setTimeout(() => {
      this.consecutiveCalls = Math.max(0, this.consecutiveCalls - 1);
    }, 30000); // Decay after 30 seconds
  }

  /**
   * Wait for thermal cooldown
   */
  private async waitForCooldown(waitMs: number): Promise<void> {
    console.log(`[LLM] Thermal throttling: waiting ${waitMs}ms before next Tier 1 call`);
    this.emit('thermal:throttled', { waitMs });
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const preferredTier = request.tier ?? 1;

    // If the caller wrapped any untrusted content in <untrusted_context> tags,
    // automatically prepend the security notice to the system prompt so the
    // model knows not to treat that content as instructions. Call sites only
    // need to sanitize/wrap the data; they don't have to remember the notice.
    const hasUntrusted =
      (request.prompt && request.prompt.includes('<untrusted_context')) ||
      (request.systemPrompt && request.systemPrompt.includes('<untrusted_context'));
    if (hasUntrusted && !(request.systemPrompt ?? '').includes(UNTRUSTED_CONTEXT_NOTICE)) {
      request = {
        ...request,
        systemPrompt: request.systemPrompt
          ? `${UNTRUSTED_CONTEXT_NOTICE}\n\n${request.systemPrompt}`
          : UNTRUSTED_CONTEXT_NOTICE,
      };
    }

    // Try Tier 1 (Ollama) first if available and requested
    if (preferredTier === 1) {
      // If Ollama isn't currently flagged available, give it one fresh probe
      // before falling through. Operators expect "ollama-only" mode to wait
      // a moment rather than instantly fail.
      if (!this.tier1Available) {
        await this.checkTier1Availability();
      }

      if (this.tier1Available) {
        // Check thermal throttling
        const { allowed, waitMs } = this.canCallTier1();

        if (!allowed) {
          // Long cooldowns no longer punt to Tier 2 in disable mode; we just
          // wait. Operators picked Ollama-only knowing latency would be higher.
          if (waitMs > 15000 && !this.disableTier2 && this.hasTier2Available()) {
            console.log(`[LLM] Thermal throttle: wait ${waitMs}ms too long, using Tier 2 instead`);
            this.emit('thermal:fallback', { waitMs, reason: 'cooldown_too_long' });
          } else {
            await this.waitForCooldown(waitMs);
          }
        }

        try {
          const response = await this.generateTier1WithRetry(request);
          return response;
        } catch (error) {
          if (this.disableTier2) {
            console.error('[LLM] Tier 1 failed and Tier 2 is disabled, giving up:', error);
            throw error instanceof Error ? error : new Error(String(error));
          }
          console.warn('[LLM] Tier 1 failed after retries, falling back to Tier 2:', error);
        }
      } else if (this.disableTier2) {
        throw new Error('Tier 1 (Ollama) unavailable and Tier 2 is disabled');
      }
    }

    // Try Tier 2 (External APIs) — skipped entirely when disableTier2 is set
    let tier2Error: unknown;
    if (preferredTier >= 1 && !this.disableTier2) {
      try {
        const response = await this.generateTier2(request);
        return response;
      } catch (error) {
        tier2Error = error;
        // A tier-2 request used to rethrow here, and every caller treats a
        // throw as "no LLM" — Agora in particular substitutes a hard-coded
        // template sentence and stores it as a real agent statement. An
        // expired key or an exhausted budget would therefore fill the public
        // feed with governance-sounding text no model produced. Degrade to
        // the local model instead, and say so.
        console.error('[LLM] Tier 2 failed, falling back to Tier 1 (Ollama):', error);
        this.emit('tier2:fallback', { reason: error instanceof Error ? error.message : String(error) });
      }
    }

    // Tier-1 fallback for a tier-2 request: either Tier 2 is switched off, or
    // it was tried above and failed.
    if (preferredTier === 2) {
      if (!this.tier1Available) {
        await this.checkTier1Availability();
      }
      if (this.tier1Available) {
        const { allowed, waitMs } = this.canCallTier1();
        if (!allowed) await this.waitForCooldown(waitMs);
        return await this.generateTier1WithRetry(request);
      }
      throw new Error('Tier 2 unavailable and Tier 1 (Ollama) is not reachable');
    }

    // A tier-1 request only gets here because Tier 1 itself failed and the
    // Tier-2 attempt above also failed. Surface that instead of returning
    // empty content: callers gate on `if (response.content)` and would
    // otherwise swallow the failure with no log line.
    if (preferredTier === 1) {
      throw tier2Error instanceof Error
        ? tier2Error
        : new Error('Tier 1 failed and no Tier 2 provider is available');
    }

    // Tier 0 - No LLM, return empty
    return {
      content: '',
      tier: 0,
      model: 'none',
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Tier 1 call with bounded exponential backoff. Each retry waits backoff *
   * 2^(attempt-1) ms; transient ollama failures (TimeoutError, ECONNREFUSED,
   * "fetch failed") all retry. We do NOT retry HTTP-level model errors since
   * those usually mean the requested model isn't loaded.
   */
  private async generateTier1WithRetry(request: LLMRequest): Promise<LLMResponse> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.tier1MaxAttempts; attempt++) {
      try {
        this.recordTier1Call();
        return await this.generateTier1(request);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient = /timeout|fetch failed|ECONNREFUSED|ECONNRESET|other side closed|abort|EAI_AGAIN/i.test(msg);
        if (!transient || attempt === this.tier1MaxAttempts) break;
        // After half the attempts have failed, re-probe ollama health. If the
        // endpoint is genuinely down (process restart) we get the new
        // availability state quickly; if it's flaky, the probe is cheap.
        if (attempt === Math.floor(this.tier1MaxAttempts / 2)) {
          await this.checkTier1Availability();
          if (!this.tier1Available) {
            console.warn(`[LLM] Tier 1 health probe failed mid-retry; will continue but expect failure`);
          }
        }
        const wait = this.tier1RetryBackoffMs * Math.pow(2, attempt - 1);
        console.warn(`[LLM] Tier 1 attempt ${attempt}/${this.tier1MaxAttempts} failed (${msg}); retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private selectModel(complexity: ModelComplexity = 'fast'): string {
    return this.config.tier1.models[complexity];
  }

  private async generateTier1(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = this.selectModel(request.complexity);

    console.log(`[LLM] Using model: ${model} (complexity: ${request.complexity || 'fast'})`);

    // Reasoning models (qwen3, deepseek-r1, etc.) silently consume tokens for
    // chain-of-thought before producing visible output, so a 256-token budget
    // returns an empty string. We set think:false (Ollama 0.6+) and floor the
    // token budget so the response actually fits.
    const isThinking = /qwen3|deepseek-r1|reasoning/i.test(model);
    const maxTokens = request.maxTokens ?? (isThinking ? 1024 : 256);

    const response = await fetch(`${this.config.tier1.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: request.systemPrompt
          ? `${request.systemPrompt}\n\nUser: ${request.prompt}\n\nAssistant:`
          : request.prompt,
        stream: false,
        think: isThinking ? false : undefined,
        // Keep the model resident. A cold load measured 4.3–4.5s on the shared
        // host (2026-08-06) — not the ~60s this comment used to claim — and
        // since the host keeps one runner per model name, staying resident is
        // also what keeps us from evicting MOSS.AO between our calls.
        keep_alive: '15m',
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: maxTokens,
          // Without an explicit num_ctx Ollama applies its server default
          // (~2048 measured on prod) and SILENTLY truncates longer prompts.
          num_ctx: this.config.tier1.numCtx,
        },
      }),
      signal: AbortSignal.timeout(this.config.tier1.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json() as {
      response: string;
      thinking?: string;
      done_reason?: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    // Truncation is silent on Ollama's side: when the prompt fills the
    // context window it drops the head and the model answers from a
    // fragment. Make that loud so an outgrown prompt is a log line, not a
    // quality mystery.
    if (
      typeof data.prompt_eval_count === 'number' &&
      data.prompt_eval_count >= this.config.tier1.numCtx - maxTokens
    ) {
      console.warn(
        `[LLM] Prompt filled the context window (${data.prompt_eval_count}/${this.config.tier1.numCtx} tokens) — input was likely truncated; raise LOCAL_LLM_NUM_CTX or trim the prompt`
      );
    }

    // Some reasoning models return only `thinking` if num_predict cuts them off
    // before the visible response. Fall back to the trimmed thinking output so
    // the caller doesn't see an empty string when the model did produce text.
    const content = (data.response || '').trim() || (data.thinking || '').trim();
    if (!content && data.done_reason === 'length') {
      throw new Error('Ollama response truncated (raise maxTokens / disable thinking)');
    }

    this.emit('generation', {
      tier: 1,
      model,
      tokensUsed: data.eval_count,
    });

    return {
      content,
      tier: 1,
      model,
      tokensUsed: data.eval_count,
      latencyMs: Date.now() - startTime,
    };
  }

  private async generateTier2(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const budgetExceeded: string[] = [];

    // Try Anthropic first
    if (this.config.tier2.anthropic) {
      if (!this.checkBudget('anthropic')) {
        budgetExceeded.push('anthropic');
        this.emit('budget:exceeded', { provider: 'anthropic' });
      } else {
        try {
          return await this.generateAnthropic(request, startTime);
        } catch (error) {
          console.warn('[LLM] Anthropic failed, trying next provider');
        }
      }
    }

    // Try OpenAI
    if (this.config.tier2.openai) {
      if (!this.checkBudget('openai')) {
        budgetExceeded.push('openai');
        this.emit('budget:exceeded', { provider: 'openai' });
      } else {
        try {
          return await this.generateOpenAI(request, startTime);
        } catch (error) {
          console.warn('[LLM] OpenAI failed, trying next provider');
        }
      }
    }

    // Try Gemini
    if (this.config.tier2.gemini) {
      if (!this.checkBudget('google')) {
        budgetExceeded.push('google');
        this.emit('budget:exceeded', { provider: 'google' });
      } else {
        try {
          return await this.generateGemini(request, startTime);
        } catch (error) {
          console.warn('[LLM] Gemini failed');
        }
      }
    }

    if (budgetExceeded.length > 0) {
      throw new BudgetExceededError(budgetExceeded.join(','));
    }
    throw new Error('All Tier 2 providers failed or not configured');
  }

  private async generateAnthropic(
    request: LLMRequest,
    startTime: number
  ): Promise<LLMResponse> {
    const config = this.config.tier2.anthropic!;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: request.maxTokens ?? 256,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${error}`);
    }

    const data = await response.json() as { content: { text?: string }[]; usage?: { output_tokens?: number; input_tokens?: number } };
    const content = data.content[0]?.text || '';

    this.emit('generation', {
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.output_tokens,
      inputTokens: data.usage?.input_tokens,
    });

    return {
      content,
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.output_tokens,
      latencyMs: Date.now() - startTime,
    };
  }

  private async generateOpenAI(
    request: LLMRequest,
    startTime: number
  ): Promise<LLMResponse> {
    const config = this.config.tier2.openai!;

    const messages: any[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: request.maxTokens ?? 256,
        temperature: request.temperature ?? 0.7,
        messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI error: ${error}`);
    }

    const data = await response.json() as { choices: { message?: { content?: string } }[]; usage?: { completion_tokens?: number; prompt_tokens?: number } };
    const content = data.choices[0]?.message?.content || '';

    this.emit('generation', {
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.completion_tokens,
      inputTokens: data.usage?.prompt_tokens,
    });

    return {
      content,
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.completion_tokens,
      latencyMs: Date.now() - startTime,
    };
  }

  private async generateGemini(
    request: LLMRequest,
    startTime: number
  ): Promise<LLMResponse> {
    const config = this.config.tier2.gemini!;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: request.systemPrompt
                    ? `${request.systemPrompt}\n\n${request.prompt}`
                    : request.prompt,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxTokens ?? 256,
            temperature: request.temperature ?? 0.7,
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini error: ${error}`);
    }

    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { candidatesTokenCount?: number } };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    this.emit('generation', {
      tier: 2,
      model: config.model,
      tokensUsed: data.usageMetadata?.candidatesTokenCount,
    });

    return {
      content,
      tier: 2,
      model: config.model,
      tokensUsed: data.usageMetadata?.candidatesTokenCount,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Register a budget gate. Called before each Tier 2 provider call;
   * if the checker returns false the provider is skipped. This is the
   * hard stop for ANTHROPIC_DAILY_BUDGET_USD enforcement.
   */
  setBudgetChecker(checker: BudgetChecker): void {
    this.budgetChecker = checker;
  }

  private checkBudget(provider: 'anthropic' | 'openai' | 'google'): boolean {
    if (!this.budgetChecker) return true;
    try {
      return this.budgetChecker(provider);
    } catch (err) {
      console.error('[LLM] Budget checker threw, denying call:', err);
      return false;
    }
  }

  isTier1Available(): boolean {
    return this.tier1Available;
  }

  hasTier2Available(): boolean {
    return !!(
      this.config.tier2.anthropic ||
      this.config.tier2.openai ||
      this.config.tier2.gemini
    );
  }

  getConfig(): LLMConfig {
    return this.config;
  }

  getThermalConfig(): ThermalThrottleConfig {
    return { ...this.thermalConfig };
  }

  /**
   * Get current thermal throttling status
   */
  getThermalStatus(): {
    callsLastMinute: number;
    maxCallsPerMinute: number;
    consecutiveCalls: number;
    currentCooldownMs: number;
    lastCallMs: number;
    isThrottled: boolean;
  } {
    const now = Date.now();
    this.tier1CallTimestamps = this.tier1CallTimestamps.filter(
      ts => now - ts < 60000
    );

    const { allowed, waitMs: _waitMs } = this.canCallTier1();

    return {
      callsLastMinute: this.tier1CallTimestamps.length,
      maxCallsPerMinute: this.thermalConfig.maxCallsPerMinute,
      consecutiveCalls: this.consecutiveCalls,
      currentCooldownMs: this.calculateCooldown(),
      lastCallMs: this.lastTier1CallTime ? now - this.lastTier1CallTime : -1,
      isThrottled: !allowed,
    };
  }

  /**
   * Update thermal throttling configuration at runtime
   */
  updateThermalConfig(updates: Partial<ThermalThrottleConfig>): void {
    this.thermalConfig = { ...this.thermalConfig, ...updates };
    console.log(`[LLM] Thermal config updated:`, this.thermalConfig);
    this.emit('thermal:config_updated', this.thermalConfig);
  }
}

// Singleton instance
export const llmService = new LLMService();

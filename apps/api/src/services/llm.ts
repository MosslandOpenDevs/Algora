import { EventEmitter } from 'events';

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

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private tier1Available: boolean = false;

  // Thermal throttling state
  private thermalConfig: ThermalThrottleConfig;
  private lastTier1CallTime: number = 0;
  private tier1CallTimestamps: number[] = [];
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue: boolean = false;
  private consecutiveCalls: number = 0;

  constructor() {
    super();

    // Thermal throttling configuration (configurable via env vars)
    // Settings optimized for server cooling - longer cooldowns to reduce heat
    this.thermalConfig = {
      minCooldownMs: parseInt(process.env.LLM_MIN_COOLDOWN_MS || '5000', 10),         // 5s min between calls (was 2s)
      maxCallsPerMinute: parseInt(process.env.LLM_MAX_CALLS_PER_MINUTE || '8', 10),   // 8 calls/min max (was 15)
      dynamicCooldown: process.env.LLM_DYNAMIC_COOLDOWN !== 'false',                  // Enable by default
      maxCooldownMs: parseInt(process.env.LLM_MAX_COOLDOWN_MS || '30000', 10),        // 30s max cooldown (was 10s)
    };

    console.log(`[LLM] Thermal throttling enabled: min cooldown ${this.thermalConfig.minCooldownMs}ms, max ${this.thermalConfig.maxCallsPerMinute} calls/min`);

    this.config = {
      tier1: {
        endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
        models: {
          fast: process.env.LOCAL_LLM_MODEL_FAST || 'llama3.2:3b',
          balanced: process.env.LOCAL_LLM_MODEL_BALANCED || 'qwen2.5:14b',
          quality: process.env.LOCAL_LLM_MODEL_QUALITY || 'qwen2.5:32b',
        },
        timeout: 120000, // 2 minutes for large models
      },
      tier2: {
        anthropic: process.env.ANTHROPIC_API_KEY
          ? {
              apiKey: process.env.ANTHROPIC_API_KEY,
              model: 'claude-3-haiku-20240307',
            }
          : undefined,
        openai: process.env.OPENAI_API_KEY
          ? {
              apiKey: process.env.OPENAI_API_KEY,
              model: 'gpt-4o-mini',
            }
          : undefined,
        gemini: process.env.GOOGLE_AI_API_KEY
          ? {
              apiKey: process.env.GOOGLE_AI_API_KEY,
              model: 'gemini-1.5-flash',
            }
          : undefined,
      },
    };

    this.checkTier1Availability();
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

    // Try Tier 1 (Ollama) first if available and requested
    if (preferredTier === 1 && this.tier1Available) {
      // Check thermal throttling
      const { allowed, waitMs } = this.canCallTier1();

      if (!allowed) {
        // If wait time is very long, fall back to Tier 2 directly
        // Increased threshold from 5s to 15s to prefer Tier 1 more aggressively (cost optimization)
        if (waitMs > 15000 && this.hasTier2Available()) {
          console.log(`[LLM] Thermal throttle: wait ${waitMs}ms too long, using Tier 2 instead`);
          this.emit('thermal:fallback', { waitMs, reason: 'cooldown_too_long' });
        } else {
          // Wait for cooldown
          await this.waitForCooldown(waitMs);
        }
      }

      try {
        this.recordTier1Call();
        const response = await this.generateTier1(request);
        return response;
      } catch (error) {
        console.warn('[LLM] Tier 1 failed, falling back to Tier 2:', error);
      }
    }

    // Try Tier 2 (External APIs)
    if (preferredTier >= 1) {
      try {
        const response = await this.generateTier2(request);
        return response;
      } catch (error) {
        console.error('[LLM] Tier 2 failed:', error);
        throw error;
      }
    }

    // Tier 0 - No LLM, return empty
    return {
      content: '',
      tier: 0,
      model: 'none',
      latencyMs: Date.now() - startTime,
    };
  }

  private selectModel(complexity: ModelComplexity = 'fast'): string {
    return this.config.tier1.models[complexity];
  }

  private async generateTier1(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const model = this.selectModel(request.complexity);

    console.log(`[LLM] Using model: ${model} (complexity: ${request.complexity || 'fast'})`);

    const response = await fetch(`${this.config.tier1.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: request.systemPrompt
          ? `${request.systemPrompt}\n\nUser: ${request.prompt}\n\nAssistant:`
          : request.prompt,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 256,
        },
      }),
      signal: AbortSignal.timeout(this.config.tier1.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json() as { response: string; eval_count?: number };

    this.emit('generation', {
      tier: 1,
      model,
      tokensUsed: data.eval_count,
    });

    return {
      content: data.response.trim(),
      tier: 1,
      model,
      tokensUsed: data.eval_count,
      latencyMs: Date.now() - startTime,
    };
  }

  private async generateTier2(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    // Try Anthropic first
    if (this.config.tier2.anthropic) {
      try {
        return await this.generateAnthropic(request, startTime);
      } catch (error) {
        console.warn('[LLM] Anthropic failed, trying next provider');
      }
    }

    // Try OpenAI
    if (this.config.tier2.openai) {
      try {
        return await this.generateOpenAI(request, startTime);
      } catch (error) {
        console.warn('[LLM] OpenAI failed, trying next provider');
      }
    }

    // Try Gemini
    if (this.config.tier2.gemini) {
      try {
        return await this.generateGemini(request, startTime);
      } catch (error) {
        console.warn('[LLM] Gemini failed');
      }
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

    const data = await response.json() as { content: { text?: string }[]; usage?: { output_tokens?: number } };
    const content = data.content[0]?.text || '';

    this.emit('generation', {
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.output_tokens,
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

    const data = await response.json() as { choices: { message?: { content?: string } }[]; usage?: { completion_tokens?: number } };
    const content = data.choices[0]?.message?.content || '';

    this.emit('generation', {
      tier: 2,
      model: config.model,
      tokensUsed: data.usage?.completion_tokens,
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

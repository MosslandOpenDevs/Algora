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

export class LLMService extends EventEmitter {
  private config: LLMConfig;
  private tier1Available: boolean = false;

  constructor() {
    super();
    this.config = {
      tier1: {
        endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
        models: {
          fast: process.env.LOCAL_LLM_MODEL_FAST || 'llama3.2:3b',
          balanced: process.env.LOCAL_LLM_MODEL_BALANCED || 'qwen2.5:32b',
          quality: process.env.LOCAL_LLM_MODEL_QUALITY || 'llama3.3:70b',
        },
        timeout: 60000, // Increased for larger models
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
        const data = await response.json();
        this.tier1Available = data.models?.length > 0;
        console.log(
          `[LLM] Tier 1 (Ollama) ${this.tier1Available ? 'available' : 'no models found'}`
        );
        if (this.tier1Available) {
          console.log(`[LLM] Available models: ${data.models.map((m: any) => m.name).join(', ')}`);
        }
      }
    } catch (error) {
      this.tier1Available = false;
      console.log('[LLM] Tier 1 (Ollama) not available - using Tier 2 fallback');
    }
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const preferredTier = request.tier ?? 1;

    // Try Tier 1 (Ollama) first if available and requested
    if (preferredTier === 1 && this.tier1Available) {
      try {
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

    const data = await response.json();

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

    const data = await response.json();
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

    const data = await response.json();
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

    const data = await response.json();
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

  getConfig(): LLMConfig {
    return this.config;
  }
}

// Singleton instance
export const llmService = new LLMService();

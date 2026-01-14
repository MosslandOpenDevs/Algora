// ===========================================
// Anthropic LLM Provider for Algora v2.0
// ===========================================
// Implements the LLMProvider interface for Claude models
// Based on SPEC sections K.1-K.6 (Tier 2 External LLM)

import type { GenerationResult, ModelProvider } from '../types.js';

/**
 * Anthropic API message format.
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Anthropic API response format.
 */
interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic provider configuration.
 */
export interface AnthropicProviderConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Base URL for Anthropic API (default: https://api.anthropic.com) */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 120000) */
  timeout: number;
  /** Number of retries on failure (default: 3) */
  maxRetries: number;
  /** Default model to use */
  defaultModel: string;
  /** Daily budget in USD (default: 10.0) */
  dailyBudgetUsd: number;
}

/**
 * Default Anthropic configuration.
 */
export const DEFAULT_ANTHROPIC_CONFIG: AnthropicProviderConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  baseUrl: 'https://api.anthropic.com',
  timeout: 120000,
  maxRetries: 3,
  defaultModel: 'claude-sonnet-4-20250514',
  dailyBudgetUsd: parseFloat(process.env.ANTHROPIC_DAILY_BUDGET_USD || '10'),
};

/**
 * Pricing per 1M tokens (as of 2025)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

/**
 * Anthropic LLM Provider implementation.
 *
 * Provides integration with Anthropic's Claude models for:
 * - High-quality text generation (Tier 2)
 * - Decision packets and serious deliberation
 * - Complex reasoning tasks
 */
export class AnthropicProvider {
  private config: AnthropicProviderConfig;
  private provider: ModelProvider = 'anthropic';
  private dailySpent: number = 0;
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  constructor(config?: Partial<AnthropicProviderConfig>) {
    this.config = { ...DEFAULT_ANTHROPIC_CONFIG, ...config };
  }

  /**
   * Generate text completion using Anthropic Claude.
   */
  async generate(
    model: string,
    prompt: string,
    options?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    // Check API key
    if (!this.config.apiKey) {
      throw new AnthropicError('ANTHROPIC_API_KEY is not configured', 0);
    }

    // Check daily budget
    this.checkAndResetDailyBudget();
    if (this.dailySpent >= this.config.dailyBudgetUsd) {
      throw new AnthropicError(
        `Daily budget exceeded: $${this.dailySpent.toFixed(2)} / $${this.config.dailyBudgetUsd}`,
        0
      );
    }

    const modelToUse = model || this.config.defaultModel;
    const messages: AnthropicMessage[] = [{ role: 'user', content: prompt }];

    try {
      const response = await this.fetchWithRetry<AnthropicResponse>(
        '/v1/messages',
        {
          method: 'POST',
          body: JSON.stringify({
            model: modelToUse,
            max_tokens: options?.maxTokens ?? 4096,
            messages,
            system: options?.systemPrompt,
            temperature: options?.temperature,
          }),
        }
      );

      const latencyMs = Date.now() - startTime;
      const content = response.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      // Calculate cost
      const pricing = MODEL_PRICING[modelToUse] || MODEL_PRICING['claude-sonnet-4-20250514'];
      const costUsd =
        (response.usage.input_tokens / 1_000_000) * pricing.input +
        (response.usage.output_tokens / 1_000_000) * pricing.output;

      // Track daily spending
      this.dailySpent += costUsd;

      return {
        content,
        model: response.model,
        provider: this.provider,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        latencyMs,
        costUsd,
        finishReason: this.mapStopReason(response.stop_reason),
        metadata: {
          messageId: response.id,
          stopSequence: response.stop_sequence,
          dailySpent: this.dailySpent,
          dailyBudget: this.config.dailyBudgetUsd,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      if (error instanceof AnthropicError) {
        throw error;
      }
      throw new AnthropicError(
        `Generation failed for model ${modelToUse}: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs
      );
    }
  }

  /**
   * Check if API key is configured.
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Get remaining budget for today.
   */
  getRemainingBudget(): number {
    this.checkAndResetDailyBudget();
    return Math.max(0, this.config.dailyBudgetUsd - this.dailySpent);
  }

  /**
   * Get daily spending.
   */
  getDailySpending(): { spent: number; budget: number; remaining: number } {
    this.checkAndResetDailyBudget();
    return {
      spent: this.dailySpent,
      budget: this.config.dailyBudgetUsd,
      remaining: Math.max(0, this.config.dailyBudgetUsd - this.dailySpent),
    };
  }

  /**
   * Check health of Anthropic API.
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }> {
    if (!this.config.apiKey) {
      return {
        healthy: false,
        latencyMs: 0,
        error: 'ANTHROPIC_API_KEY is not configured',
      };
    }

    const startTime = Date.now();
    try {
      // Make a minimal API call to check connectivity
      await this.generate('claude-3-haiku-20240307', 'Hello', {
        maxTokens: 10,
      });
      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check and reset daily budget if new day.
   */
  private checkAndResetDailyBudget(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailySpent = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Map Anthropic stop reason to standard format.
   */
  private mapStopReason(
    reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null
  ): 'stop' | 'length' | 'error' | 'safety' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * Fetch with retry logic.
   */
  private async fetchWithRetry<T>(
    path: string,
    options: RequestInit
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(`${this.config.baseUrl}${path}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort or auth errors
        if (lastError.name === 'AbortError') {
          throw new AnthropicError('Request timed out', this.config.timeout);
        }
        if (lastError.message.includes('401')) {
          throw new AnthropicError('Invalid API key', 0);
        }
        if (lastError.message.includes('429')) {
          // Rate limited - wait longer
          const delay = Math.min(5000 * Math.pow(2, attempt), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<AnthropicProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Custom error class for Anthropic errors.
 */
export class AnthropicError extends Error {
  constructor(
    message: string,
    public latencyMs?: number
  ) {
    super(message);
    this.name = 'AnthropicError';
  }
}

/**
 * Anthropic LLM Provider adapter for the ModelRouter.
 */
export class AnthropicLLMProvider {
  private anthropicProvider: AnthropicProvider;

  constructor(config?: Partial<AnthropicProviderConfig>) {
    this.anthropicProvider = new AnthropicProvider(config);
  }

  async generate(
    model: string,
    prompt: string,
    options?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<GenerationResult> {
    return this.anthropicProvider.generate(model, prompt, options);
  }

  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return this.anthropicProvider.checkHealth();
  }

  isConfigured(): boolean {
    return this.anthropicProvider.isConfigured();
  }

  getRemainingBudget(): number {
    return this.anthropicProvider.getRemainingBudget();
  }

  getDailySpending(): { spent: number; budget: number; remaining: number } {
    return this.anthropicProvider.getDailySpending();
  }

  getProvider(): AnthropicProvider {
    return this.anthropicProvider;
  }
}

/**
 * Create an Anthropic LLM provider.
 */
export function createAnthropicProvider(
  config?: Partial<AnthropicProviderConfig>
): AnthropicProvider {
  return new AnthropicProvider(config);
}

/**
 * Create an Anthropic LLM provider for the ModelRouter.
 */
export function createAnthropicLLMProvider(
  config?: Partial<AnthropicProviderConfig>
): AnthropicLLMProvider {
  return new AnthropicLLMProvider(config);
}

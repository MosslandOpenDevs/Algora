// ===========================================
// Real LLM Provider for Algora v2.0
// ===========================================
// Provides real LLM integration using Ollama (primary) with Anthropic fallback
// Implements the Orchestrator's LLMProvider interface

import type { LLMProvider } from './specialist-manager.js';
import {
  OllamaProvider,
  AnthropicProvider,
  type OllamaProviderConfig,
  type AnthropicProviderConfig,
} from '@algora/model-router';

/**
 * Configuration for RealLLMProvider.
 */
export interface RealLLMProviderConfig {
  /** Ollama configuration */
  ollama?: Partial<OllamaProviderConfig>;
  /** Anthropic configuration */
  anthropic?: Partial<AnthropicProviderConfig>;
  /** Default model for Ollama (default: llama3.2:8b) */
  ollamaDefaultModel?: string;
  /** Default model for Anthropic (default: claude-sonnet-4-20250514) */
  anthropicDefaultModel?: string;
  /** Whether to fallback to Anthropic when Ollama fails (default: true) */
  enableFallback?: boolean;
  /** Minimum token count to use Anthropic (for complex tasks, default: 0) */
  anthropicMinTokens?: number;
  /** Whether to prefer Anthropic for critical tasks (default: false) */
  preferAnthropicForCritical?: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_REAL_LLM_PROVIDER_CONFIG: RealLLMProviderConfig = {
  ollamaDefaultModel: process.env.LOCAL_LLM_MODEL_CHATTER || 'llama3.2:8b',
  anthropicDefaultModel: 'claude-sonnet-4-20250514',
  enableFallback: true,
  anthropicMinTokens: 0,
  preferAnthropicForCritical: false,
};

/**
 * Real LLM Provider that uses Ollama locally with Anthropic as fallback.
 *
 * This provider:
 * 1. Tries Ollama first (free, local, fast)
 * 2. Falls back to Anthropic if Ollama fails (paid, external, high quality)
 * 3. Tracks costs and usage for budget management
 */
export class RealLLMProvider implements LLMProvider {
  private ollamaProvider: OllamaProvider;
  private anthropicProvider: AnthropicProvider;
  private config: RealLLMProviderConfig;
  private ollamaHealthy: boolean = true;
  private lastHealthCheck: number = 0;
  private healthCheckIntervalMs: number = 60000; // Check health every minute

  constructor(config?: Partial<RealLLMProviderConfig>) {
    this.config = { ...DEFAULT_REAL_LLM_PROVIDER_CONFIG, ...config };
    this.ollamaProvider = new OllamaProvider(this.config.ollama);
    this.anthropicProvider = new AnthropicProvider(this.config.anthropic);
  }

  /**
   * Generate a completion using real LLM.
   * Tries Ollama first, falls back to Anthropic if needed.
   */
  async generate(options: {
    prompt: string;
    maxTokens: number;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{
    content: string;
    model: string;
    tokenCount: number;
    costUsd: number;
  }> {
    // Check if we should use Anthropic directly
    const useAnthropicDirectly = this.shouldUseAnthropic(options);

    if (useAnthropicDirectly && this.anthropicProvider.isConfigured()) {
      return this.generateWithAnthropic(options);
    }

    // Try Ollama first
    await this.checkOllamaHealth();

    if (this.ollamaHealthy) {
      try {
        return await this.generateWithOllama(options);
      } catch (error) {
        console.warn('[RealLLMProvider] Ollama failed, trying fallback:', error);
        this.ollamaHealthy = false;
      }
    }

    // Fallback to Anthropic
    if (this.config.enableFallback && this.anthropicProvider.isConfigured()) {
      return this.generateWithAnthropic(options);
    }

    // If all fails, throw error
    throw new Error(
      'No LLM provider available. Ollama is not healthy and Anthropic is not configured.'
    );
  }

  /**
   * Generate using Ollama.
   */
  private async generateWithOllama(options: {
    prompt: string;
    maxTokens: number;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{
    content: string;
    model: string;
    tokenCount: number;
    costUsd: number;
  }> {
    const model = this.config.ollamaDefaultModel || 'llama3.2:8b';
    const result = await this.ollamaProvider.generate(model, options.prompt, {
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    return {
      content: result.content,
      model: result.model,
      tokenCount: result.usage.totalTokens,
      costUsd: result.costUsd,
    };
  }

  /**
   * Generate using Anthropic.
   */
  private async generateWithAnthropic(options: {
    prompt: string;
    maxTokens: number;
    systemPrompt?: string;
    temperature?: number;
  }): Promise<{
    content: string;
    model: string;
    tokenCount: number;
    costUsd: number;
  }> {
    const model = this.config.anthropicDefaultModel || 'claude-sonnet-4-20250514';
    const result = await this.anthropicProvider.generate(model, options.prompt, {
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    return {
      content: result.content,
      model: result.model,
      tokenCount: result.usage.totalTokens,
      costUsd: result.costUsd,
    };
  }

  /**
   * Check if we should use Anthropic directly (bypass Ollama).
   */
  private shouldUseAnthropic(options: {
    prompt: string;
    maxTokens: number;
    systemPrompt?: string;
  }): boolean {
    // Use Anthropic for complex/critical tasks if configured
    if (this.config.preferAnthropicForCritical) {
      const promptLower = options.prompt.toLowerCase();
      const isCritical =
        promptLower.includes('critical') ||
        promptLower.includes('high-risk') ||
        promptLower.includes('decision packet') ||
        promptLower.includes('serious deliberation');
      if (isCritical) {
        return true;
      }
    }

    // Use Anthropic if output tokens exceed threshold
    if (
      this.config.anthropicMinTokens &&
      options.maxTokens >= this.config.anthropicMinTokens
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check Ollama health periodically.
   */
  private async checkOllamaHealth(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckIntervalMs) {
      return;
    }

    this.lastHealthCheck = now;

    try {
      const health = await this.ollamaProvider.checkHealth();
      this.ollamaHealthy = health.healthy;
      if (!health.healthy) {
        console.warn('[RealLLMProvider] Ollama unhealthy:', health.error);
      }
    } catch (error) {
      this.ollamaHealthy = false;
      console.warn('[RealLLMProvider] Ollama health check failed:', error);
    }
  }

  /**
   * Get status of providers.
   */
  getStatus(): {
    ollamaHealthy: boolean;
    anthropicConfigured: boolean;
    anthropicBudget: { spent: number; budget: number; remaining: number } | null;
  } {
    return {
      ollamaHealthy: this.ollamaHealthy,
      anthropicConfigured: this.anthropicProvider.isConfigured(),
      anthropicBudget: this.anthropicProvider.isConfigured()
        ? this.anthropicProvider.getDailySpending()
        : null,
    };
  }

  /**
   * Force use Anthropic for next N calls (for testing/debugging).
   */
  forceAnthropicForNextCalls(count: number): void {
    this.ollamaHealthy = false;
    setTimeout(() => {
      this.ollamaHealthy = true;
    }, count * 10000);
  }

  /**
   * Get the Ollama provider for direct access.
   */
  getOllamaProvider(): OllamaProvider {
    return this.ollamaProvider;
  }

  /**
   * Get the Anthropic provider for direct access.
   */
  getAnthropicProvider(): AnthropicProvider {
    return this.anthropicProvider;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RealLLMProviderConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.ollama) {
      this.ollamaProvider.updateConfig(config.ollama);
    }
    if (config.anthropic) {
      this.anthropicProvider.updateConfig(config.anthropic);
    }
  }
}

/**
 * Create a RealLLMProvider with default configuration.
 */
export function createRealLLMProvider(
  config?: Partial<RealLLMProviderConfig>
): RealLLMProvider {
  return new RealLLMProvider(config);
}

/**
 * Create a RealLLMProvider optimized for Tier 1 (local chatter).
 * Uses faster, smaller models for quick responses.
 */
export function createTier1LLMProvider(
  config?: Partial<RealLLMProviderConfig>
): RealLLMProvider {
  return new RealLLMProvider({
    ollamaDefaultModel: process.env.LOCAL_LLM_MODEL_CHATTER || 'llama3.2:8b',
    enableFallback: true,
    preferAnthropicForCritical: false,
    ...config,
  });
}

/**
 * Create a RealLLMProvider optimized for Tier 2 (serious deliberation).
 * Uses higher quality models, prefers Anthropic for critical tasks.
 */
export function createTier2LLMProvider(
  config?: Partial<RealLLMProviderConfig>
): RealLLMProvider {
  return new RealLLMProvider({
    ollamaDefaultModel: process.env.LOCAL_LLM_MODEL_ENHANCED || 'qwen2.5:32b',
    anthropicDefaultModel: 'claude-sonnet-4-20250514',
    enableFallback: true,
    preferAnthropicForCritical: true,
    ...config,
  });
}

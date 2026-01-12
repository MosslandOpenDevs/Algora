// ===========================================
// Ollama LLM Provider for Algora v2.0
// ===========================================
// Implements the LLMProvider interface for local Ollama models
// Based on SPEC sections K.1-K.6 and P.1-P.3

import type { GenerationResult, ModelProvider } from '../types.js';

/**
 * Ollama API response format.
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama chat message format.
 */
interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Ollama chat API response format.
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama embedding response format.
 */
interface OllamaEmbeddingResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

/**
 * Ollama model list response.
 */
interface OllamaModelsResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model: string;
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

/**
 * Ollama provider configuration.
 */
export interface OllamaProviderConfig {
  /** Base URL for Ollama API (default: http://localhost:11434) */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 120000) */
  timeout: number;
  /** Number of retries on failure (default: 3) */
  maxRetries: number;
  /** Keep model in memory between requests */
  keepAlive?: string;
}

/**
 * Default Ollama configuration.
 */
export const DEFAULT_OLLAMA_CONFIG: OllamaProviderConfig = {
  baseUrl: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
  timeout: 120000,
  maxRetries: 3,
  keepAlive: '5m',
};

/**
 * Ollama LLM Provider implementation.
 *
 * Provides integration with local Ollama models for:
 * - Text generation (llama3.2, qwen2.5, phi4, mistral, etc.)
 * - Code generation (qwen2.5-coder, deepseek-coder)
 * - Vision (llama3.2-vision)
 * - Embeddings (nomic-embed-text, bge-m3, mxbai-embed-large)
 * - Korean (qwen2.5, exaone3.5)
 */
export class OllamaProvider {
  private config: OllamaProviderConfig;
  private provider: ModelProvider = 'ollama';

  constructor(config?: Partial<OllamaProviderConfig>) {
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  }

  /**
   * Generate text completion using Ollama.
   */
  async generate(
    model: string,
    prompt: string,
    options?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      stream?: boolean;
    }
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      // Use chat API if system prompt is provided
      if (options?.systemPrompt) {
        return this.generateChat(model, prompt, options, startTime);
      }

      // Use generate API for simple prompts
      const response = await this.fetchWithRetry<OllamaGenerateResponse>(
        '/api/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
              num_predict: options?.maxTokens ?? 2048,
              temperature: options?.temperature ?? 0.7,
              top_p: options?.topP ?? 0.9,
              top_k: options?.topK ?? 40,
            },
            keep_alive: this.config.keepAlive,
          }),
        }
      );

      const latencyMs = Date.now() - startTime;
      const promptTokens = response.prompt_eval_count || this.estimateTokens(prompt);
      const completionTokens = response.eval_count || this.estimateTokens(response.response);

      return {
        content: response.response,
        model,
        provider: this.provider,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs,
        costUsd: 0, // Local models are free
        finishReason: 'stop',
        metadata: {
          totalDuration: response.total_duration,
          loadDuration: response.load_duration,
          evalDuration: response.eval_duration,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw new OllamaError(
        `Generation failed for model ${model}: ${error instanceof Error ? error.message : String(error)}`,
        latencyMs
      );
    }
  }

  /**
   * Generate using chat API (supports system prompts).
   */
  private async generateChat(
    model: string,
    prompt: string,
    options: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
    },
    startTime: number
  ): Promise<GenerationResult> {
    const messages: OllamaChatMessage[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.fetchWithRetry<OllamaChatResponse>(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            num_predict: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            top_p: options.topP ?? 0.9,
            top_k: options.topK ?? 40,
          },
          keep_alive: this.config.keepAlive,
        }),
      }
    );

    const latencyMs = Date.now() - startTime;
    const promptTokens = response.prompt_eval_count ||
      this.estimateTokens(prompt) + this.estimateTokens(options.systemPrompt || '');
    const completionTokens = response.eval_count ||
      this.estimateTokens(response.message.content);

    return {
      content: response.message.content,
      model,
      provider: this.provider,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      latencyMs,
      costUsd: 0,
      finishReason: 'stop',
      metadata: {
        totalDuration: response.total_duration,
        loadDuration: response.load_duration,
        evalDuration: response.eval_duration,
      },
    };
  }

  /**
   * Generate embeddings using Ollama.
   */
  async embed(
    model: string,
    texts: string[]
  ): Promise<{
    embeddings: number[][];
    model: string;
    promptTokens: number;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    // Ollama embed endpoint handles multiple texts
    const response = await this.fetchWithRetry<OllamaEmbeddingResponse>(
      '/api/embed',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          input: texts,
        }),
      }
    );

    const latencyMs = Date.now() - startTime;
    const promptTokens = response.prompt_eval_count ||
      texts.reduce((sum, t) => sum + this.estimateTokens(t), 0);

    return {
      embeddings: response.embeddings,
      model,
      promptTokens,
      latencyMs,
    };
  }

  /**
   * Check if Ollama is running and responsive.
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.fetchWithRetry<unknown>('/api/tags', { method: 'GET' });
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
   * List available models in Ollama.
   */
  async listModels(): Promise<string[]> {
    const response = await this.fetchWithRetry<OllamaModelsResponse>(
      '/api/tags',
      { method: 'GET' }
    );
    return response.models.map((m) => m.name);
  }

  /**
   * Check if a specific model is available.
   */
  async isModelAvailable(model: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models.some((m) => m === model || m.startsWith(model + ':'));
    } catch {
      return false;
    }
  }

  /**
   * Pull a model from Ollama registry.
   */
  async pullModel(
    model: string,
    onProgress?: (status: string, completed?: number, total?: number) => void
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (onProgress) {
              onProgress(data.status, data.completed, data.total);
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }

      return true;
    } catch (error) {
      if (onProgress) {
        onProgress(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
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
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort or non-retryable errors
        if (lastError.name === 'AbortError') {
          throw new OllamaError('Request timed out', this.config.timeout);
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
   * Estimate token count (rough approximation).
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token for English
    // ~2 characters per token for CJK
    const cjkRegex = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
    const cjkChars = (text.match(cjkRegex) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 2 + otherChars / 4);
  }

  /**
   * Get the base URL.
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<OllamaProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Custom error class for Ollama errors.
 */
export class OllamaError extends Error {
  constructor(
    message: string,
    public latencyMs?: number
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

/**
 * Ollama model install commands from SPEC P.1.
 * These are documentation/helper commands for setting up local models.
 */
export const OLLAMA_INSTALL_COMMANDS = {
  // Core text models
  chatter: ['ollama pull llama3.2:8b', 'ollama pull phi4:14b'],
  debate: ['ollama pull qwen2.5:14b', 'ollama pull mistral-small-3:24b'],
  coreDecision: ['ollama pull qwen2.5:32b', 'ollama pull qwen3:32b'],
  coding: ['ollama pull qwen2.5-coder:32b', 'ollama pull deepseek-coder:33b'],
  vision: ['ollama pull llama3.2-vision:11b'],
  korean: ['ollama pull qwen2.5:32b', 'ollama pull exaone3.5:32b'],
  fallback: ['ollama pull qwen2.5:72b-q4'],

  // Embedding models
  embeddings: [
    'ollama pull nomic-embed-text',
    'ollama pull mxbai-embed-large',
    'ollama pull bge-m3',
  ],

  // Reranking
  rerankers: ['ollama pull bge-reranker-v2-m3'],
};

/**
 * Hardware requirements from SPEC P.3.
 */
export const OLLAMA_HARDWARE_REQUIREMENTS = {
  'llama3.2:8b': { vram: '6GB', ram: '16GB' },
  'phi4:14b': { vram: '10GB', ram: '24GB' },
  'qwen2.5:14b': { vram: '10GB', ram: '24GB' },
  'qwen2.5:32b': { vram: '22GB', ram: '48GB' },
  'qwen2.5:72b-q4': { vram: '45GB', ram: '64GB' },
  'qwen2.5-coder:32b': { vram: '22GB', ram: '48GB' },
  'mistral-small-3:24b': { vram: '16GB', ram: '32GB' },
  'llama3.2-vision:11b': { vram: '8GB', ram: '20GB' },
  'exaone3.5:32b': { vram: '22GB', ram: '48GB' },
};

/**
 * Create an Ollama provider with default configuration.
 */
export function createOllamaProvider(
  config?: Partial<OllamaProviderConfig>
): OllamaProvider {
  return new OllamaProvider(config);
}

/**
 * LLM Provider adapter for the ModelRouter.
 * Wraps OllamaProvider to implement the LLMProvider interface.
 */
export class OllamaLLMProvider {
  private ollamaProvider: OllamaProvider;

  constructor(config?: Partial<OllamaProviderConfig>) {
    this.ollamaProvider = new OllamaProvider(config);
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
    return this.ollamaProvider.generate(model, prompt, options);
  }

  async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    return this.ollamaProvider.checkHealth();
  }

  async listModels(): Promise<string[]> {
    return this.ollamaProvider.listModels();
  }

  async isModelAvailable(model: string): Promise<boolean> {
    return this.ollamaProvider.isModelAvailable(model);
  }

  getProvider(): OllamaProvider {
    return this.ollamaProvider;
  }
}

/**
 * Create an Ollama LLM provider for the ModelRouter.
 */
export function createOllamaLLMProvider(
  config?: Partial<OllamaProviderConfig>
): OllamaLLMProvider {
  return new OllamaLLMProvider(config);
}

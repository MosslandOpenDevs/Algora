// ===========================================
// Model Registry for Algora v2.0
// ===========================================

import type {
  ModelEntry,
  ModelStatus,
  ModelCapability,
  ModelProvider,
  HealthCheckResult,
  LLMTier,
} from './types.js';

/**
 * Storage interface for model registry.
 */
export interface ModelRegistryStorage {
  save(model: ModelEntry): Promise<void>;
  get(id: string): Promise<ModelEntry | null>;
  getAll(): Promise<ModelEntry[]>;
  getByProvider(provider: ModelProvider): Promise<ModelEntry[]>;
  getByTier(tier: LLMTier): Promise<ModelEntry[]>;
  getByCapability(capability: ModelCapability): Promise<ModelEntry[]>;
  updateStatus(id: string, status: ModelStatus): Promise<void>;
  updateHealthCheck(id: string, result: HealthCheckResult): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory model registry storage implementation.
 */
export class InMemoryModelRegistryStorage implements ModelRegistryStorage {
  private models: Map<string, ModelEntry> = new Map();

  async save(model: ModelEntry): Promise<void> {
    this.models.set(model.id, model);
  }

  async get(id: string): Promise<ModelEntry | null> {
    return this.models.get(id) || null;
  }

  async getAll(): Promise<ModelEntry[]> {
    return Array.from(this.models.values());
  }

  async getByProvider(provider: ModelProvider): Promise<ModelEntry[]> {
    return Array.from(this.models.values()).filter(
      (m) => m.provider === provider
    );
  }

  async getByTier(tier: LLMTier): Promise<ModelEntry[]> {
    return Array.from(this.models.values()).filter((m) => m.tier === tier);
  }

  async getByCapability(capability: ModelCapability): Promise<ModelEntry[]> {
    return Array.from(this.models.values()).filter((m) =>
      m.capabilities.includes(capability)
    );
  }

  async updateStatus(id: string, status: ModelStatus): Promise<void> {
    const model = this.models.get(id);
    if (model) {
      model.status = status;
      this.models.set(id, model);
    }
  }

  async updateHealthCheck(id: string, result: HealthCheckResult): Promise<void> {
    const model = this.models.get(id);
    if (model) {
      model.status = result.status;
      model.lastHealthCheck = result.timestamp;
      model.lastHealthResult = result;
      if (result.tokensPerSecond) {
        model.tokensPerSecond = result.tokensPerSecond;
      }
      this.models.set(id, model);
    }
  }

  async delete(id: string): Promise<void> {
    this.models.delete(id);
  }
}

/**
 * Health check provider interface.
 */
export interface HealthCheckProvider {
  checkHealth(model: ModelEntry): Promise<HealthCheckResult>;
}

/**
 * Default health check provider (pings the model endpoint).
 */
export class DefaultHealthCheckProvider implements HealthCheckProvider {
  async checkHealth(model: ModelEntry): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Simulate health check based on provider
      // In production, this would actually ping the model endpoint
      const isAvailable = await this.pingModel(model);
      const latencyMs = Date.now() - startTime;

      return {
        status: isAvailable ? 'available' : 'unavailable',
        latencyMs,
        tokensPerSecond: model.tokensPerSecond,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unavailable',
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
    }
  }

  private async pingModel(_model: ModelEntry): Promise<boolean> {
    // In production, this would make an actual request to the model
    // For now, we simulate availability
    return true;
  }
}

/**
 * Options for model registry.
 */
export interface ModelRegistryOptions {
  storage?: ModelRegistryStorage;
  healthCheckProvider?: HealthCheckProvider;
  healthCheckIntervalMs?: number;
  autoHealthCheck?: boolean;
}

/**
 * Model Registry manages available LLM models.
 */
export class ModelRegistry {
  private storage: ModelRegistryStorage;
  private healthCheckProvider: HealthCheckProvider;
  private healthCheckIntervalMs: number;
  private autoHealthCheck: boolean;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private eventListeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor(options?: ModelRegistryOptions) {
    this.storage = options?.storage || new InMemoryModelRegistryStorage();
    this.healthCheckProvider =
      options?.healthCheckProvider || new DefaultHealthCheckProvider();
    this.healthCheckIntervalMs = options?.healthCheckIntervalMs || 60000;
    this.autoHealthCheck = options?.autoHealthCheck ?? false;

    if (this.autoHealthCheck) {
      this.startHealthChecks();
    }
  }

  /**
   * Register a new model.
   */
  async register(model: ModelEntry): Promise<void> {
    await this.storage.save(model);
    this.emit('model:registered', { model });
  }

  /**
   * Unregister a model.
   */
  async unregister(id: string): Promise<void> {
    await this.storage.delete(id);
    this.emit('model:unregistered', { modelId: id });
  }

  /**
   * Get a specific model by ID.
   */
  async get(id: string): Promise<ModelEntry | null> {
    return this.storage.get(id);
  }

  /**
   * Get all registered models.
   */
  async getAll(): Promise<ModelEntry[]> {
    return this.storage.getAll();
  }

  /**
   * Get available models (status = 'available').
   */
  async getAvailable(): Promise<ModelEntry[]> {
    const all = await this.getAll();
    return all.filter((m) => m.status === 'available');
  }

  /**
   * Get models by provider.
   */
  async getByProvider(provider: ModelProvider): Promise<ModelEntry[]> {
    return this.storage.getByProvider(provider);
  }

  /**
   * Get models by tier.
   */
  async getByTier(tier: LLMTier): Promise<ModelEntry[]> {
    return this.storage.getByTier(tier);
  }

  /**
   * Get models by capability.
   */
  async getByCapability(capability: ModelCapability): Promise<ModelEntry[]> {
    return this.storage.getByCapability(capability);
  }

  /**
   * Find models matching criteria.
   */
  async findModels(criteria: {
    tier?: LLMTier;
    provider?: ModelProvider;
    capabilities?: ModelCapability[];
    languages?: string[];
    specializations?: string[];
    availableOnly?: boolean;
  }): Promise<ModelEntry[]> {
    let models = await this.getAll();

    if (criteria.availableOnly !== false) {
      models = models.filter((m) => m.status === 'available');
    }

    if (criteria.tier !== undefined) {
      models = models.filter((m) => m.tier === criteria.tier);
    }

    if (criteria.provider) {
      models = models.filter((m) => m.provider === criteria.provider);
    }

    if (criteria.capabilities && criteria.capabilities.length > 0) {
      models = models.filter((m) =>
        criteria.capabilities!.every((cap) => m.capabilities.includes(cap))
      );
    }

    if (criteria.languages && criteria.languages.length > 0) {
      models = models.filter((m) =>
        criteria.languages!.some((lang) => m.languages.includes(lang))
      );
    }

    if (criteria.specializations && criteria.specializations.length > 0) {
      models = models.filter((m) =>
        criteria.specializations!.some((spec) => m.specializations.includes(spec))
      );
    }

    return models;
  }

  /**
   * Get the best model for a given task.
   */
  async getBestModel(criteria: {
    tier?: LLMTier;
    capabilities?: ModelCapability[];
    languages?: string[];
    specializations?: string[];
    preferLocal?: boolean;
  }): Promise<ModelEntry | null> {
    const models = await this.findModels({
      ...criteria,
      availableOnly: true,
    });

    if (models.length === 0) {
      return null;
    }

    // Sort by preference
    models.sort((a, b) => {
      // Prefer local (tier 1) if specified
      if (criteria.preferLocal) {
        if (a.tier === 1 && b.tier !== 1) return -1;
        if (b.tier === 1 && a.tier !== 1) return 1;
      }

      // Prefer lower cost
      if (a.costPer1kTokens !== b.costPer1kTokens) {
        return a.costPer1kTokens - b.costPer1kTokens;
      }

      // Prefer faster (higher tokens per second)
      return b.tokensPerSecond - a.tokensPerSecond;
    });

    return models[0];
  }

  /**
   * Update model status.
   */
  async updateStatus(id: string, status: ModelStatus): Promise<void> {
    await this.storage.updateStatus(id, status);
    this.emit('model:status_changed', { modelId: id, status });
  }

  /**
   * Check health of a specific model.
   */
  async checkHealth(id: string): Promise<HealthCheckResult> {
    const model = await this.get(id);
    if (!model) {
      return {
        status: 'unavailable',
        error: 'Model not found',
        timestamp: new Date(),
      };
    }

    const result = await this.healthCheckProvider.checkHealth(model);
    await this.storage.updateHealthCheck(id, result);

    this.emit('health:checked', { modelId: id, result });

    if (result.status === 'degraded' || result.status === 'unavailable') {
      this.emit('health:degraded', { modelId: id, result });
    }

    return result;
  }

  /**
   * Check health of all models.
   */
  async checkAllHealth(): Promise<Map<string, HealthCheckResult>> {
    const models = await this.getAll();
    const results = new Map<string, HealthCheckResult>();

    for (const model of models) {
      const result = await this.checkHealth(model.id);
      results.set(model.id, result);
    }

    return results;
  }

  /**
   * Start automatic health checks.
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.checkAllHealth();
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop automatic health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Get fallback chain for a model.
   */
  async getFallbackChain(
    primaryModelId: string,
    options?: {
      sameTier?: boolean;
      sameProvider?: boolean;
      sameCapabilities?: boolean;
    }
  ): Promise<string[]> {
    const primary = await this.get(primaryModelId);
    if (!primary) {
      return [];
    }

    let fallbacks = await this.getAvailable();
    fallbacks = fallbacks.filter((m) => m.id !== primaryModelId);

    if (options?.sameTier) {
      fallbacks = fallbacks.filter((m) => m.tier === primary.tier);
    }

    if (options?.sameProvider) {
      fallbacks = fallbacks.filter((m) => m.provider === primary.provider);
    }

    if (options?.sameCapabilities) {
      fallbacks = fallbacks.filter((m) =>
        primary.capabilities.every((cap) => m.capabilities.includes(cap))
      );
    }

    // Sort by cost (prefer cheaper)
    fallbacks.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);

    return fallbacks.map((m) => m.id);
  }

  /**
   * Seed registry with default models.
   */
  async seedDefaultModels(): Promise<void> {
    const defaultModels: ModelEntry[] = [
      // Tier 1 - Local models (Ollama on 100.81.60.60)
      {
        id: 'qwen3.5:4b',
        name: 'Qwen 3.5 4B',
        provider: 'ollama',
        tier: 1,
        capabilities: ['text'],
        contextWindow: 32768,
        tokensPerSecond: 60,
        costPer1kTokens: 0,
        languages: ['en', 'ko', 'zh'],
        specializations: ['chatter', 'scouting'],
        status: 'available',
      },
      {
        id: 'qwen3.5:9b',
        name: 'Qwen 3.5 9B',
        provider: 'ollama',
        tier: 1,
        capabilities: ['text', 'code'],
        contextWindow: 32768,
        tokensPerSecond: 40,
        costPer1kTokens: 0,
        languages: ['en', 'ko', 'zh'],
        specializations: ['debate', 'summarization', 'korean', 'translation'],
        status: 'available',
      },
      {
        id: 'gemma4:e4b',
        name: 'Gemma 4 E4B',
        provider: 'ollama',
        tier: 1,
        capabilities: ['text', 'code'],
        contextWindow: 32768,
        tokensPerSecond: 30,
        costPer1kTokens: 0,
        languages: ['en', 'ko'],
        specializations: ['core_decision', 'research', 'coding', 'reasoning'],
        status: 'available',
      },
      // Embedding models
      {
        id: 'nomic-embed-text',
        name: 'Nomic Embed Text',
        provider: 'ollama',
        tier: 1,
        capabilities: ['embedding'],
        contextWindow: 8192,
        tokensPerSecond: 1000,
        costPer1kTokens: 0,
        languages: ['en'],
        specializations: ['embedding'],
        status: 'available',
      },
      {
        id: 'mxbai-embed-large',
        name: 'MixedBread Embed Large',
        provider: 'ollama',
        tier: 1,
        capabilities: ['embedding'],
        contextWindow: 512,
        tokensPerSecond: 800,
        costPer1kTokens: 0,
        languages: ['en'],
        specializations: ['embedding'],
        status: 'available',
      },
      {
        id: 'bge-m3',
        name: 'BGE M3',
        provider: 'ollama',
        tier: 1,
        capabilities: ['embedding'],
        contextWindow: 8192,
        tokensPerSecond: 600,
        costPer1kTokens: 0,
        languages: ['en', 'ko', 'zh', 'ja'],
        specializations: ['embedding', 'multilingual'],
        status: 'available',
      },
      // Reranker models
      {
        id: 'bge-reranker-v2-m3',
        name: 'BGE Reranker v2 M3',
        provider: 'ollama',
        tier: 1,
        capabilities: ['rerank'],
        contextWindow: 512,
        tokensPerSecond: 500,
        costPer1kTokens: 0,
        languages: ['en', 'ko', 'zh', 'ja'],
        specializations: ['reranking', 'multilingual'],
        status: 'available',
      },
      // Tier 2 - External models
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        tier: 2,
        capabilities: ['text', 'code', 'vision', 'functions'],
        contextWindow: 200000,
        tokensPerSecond: 100,
        costPer1kTokens: 0.003,
        languages: ['en', 'ko', 'zh', 'ja', 'fr', 'de', 'es'],
        specializations: ['complex_analysis', 'critical'],
        status: 'available',
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        tier: 2,
        capabilities: ['text', 'code', 'vision', 'functions'],
        contextWindow: 128000,
        tokensPerSecond: 80,
        costPer1kTokens: 0.005,
        languages: ['en', 'ko', 'zh', 'ja', 'fr', 'de', 'es'],
        specializations: ['complex_analysis', 'critical'],
        status: 'available',
      },
    ];

    for (const model of defaultModels) {
      await this.register(model);
    }
  }

  /**
   * Subscribe to registry events.
   */
  on(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from registry events.
   */
  off(event: string, callback: (data: unknown) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event.
   */
  private emit(event: string, data: unknown): void {
    this.eventListeners.get(event)?.forEach((callback) => callback(data));
  }

  /**
   * Get registry statistics.
   */
  async getStats(): Promise<{
    totalModels: number;
    availableModels: number;
    byProvider: Record<ModelProvider, number>;
    byTier: Record<LLMTier, number>;
    byCapability: Record<ModelCapability, number>;
  }> {
    const models = await this.getAll();
    const available = models.filter((m) => m.status === 'available');

    const byProvider: Record<string, number> = {};
    const byTier: Record<number, number> = {};
    const byCapability: Record<string, number> = {};

    for (const model of models) {
      byProvider[model.provider] = (byProvider[model.provider] || 0) + 1;
      byTier[model.tier] = (byTier[model.tier] || 0) + 1;
      for (const cap of model.capabilities) {
        byCapability[cap] = (byCapability[cap] || 0) + 1;
      }
    }

    return {
      totalModels: models.length,
      availableModels: available.length,
      byProvider: byProvider as Record<ModelProvider, number>,
      byTier: byTier as Record<LLMTier, number>,
      byCapability: byCapability as Record<ModelCapability, number>,
    };
  }
}

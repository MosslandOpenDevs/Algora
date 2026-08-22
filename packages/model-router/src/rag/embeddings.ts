// ===========================================
// Embedding Service for Algora v2.0
// ===========================================

import type {
  EmbeddingModel,
  EmbeddingRequest,
  EmbeddingResult,
} from '../types.js';
import { DEFAULT_EMBEDDING_MODELS } from '../types.js';

/**
 * Embedding provider interface.
 */
export interface EmbeddingProvider {
  embed(texts: string[], model: string): Promise<number[][]>;
  getModelInfo(model: string): EmbeddingModel | null;
}

/**
 * Mock embedding provider for testing.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  private models: Map<string, EmbeddingModel> = new Map();

  constructor() {
    for (const model of DEFAULT_EMBEDDING_MODELS) {
      this.models.set(model.id, model);
    }
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    const modelInfo = this.models.get(model);
    const dimensions = modelInfo?.dimensions || 768;

    // Generate mock embeddings
    return texts.map(() => {
      const embedding = new Array(dimensions);
      for (let i = 0; i < dimensions; i++) {
        embedding[i] = Math.random() * 2 - 1; // Random values between -1 and 1
      }
      // Normalize
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      return embedding.map((val) => val / magnitude);
    });
  }

  getModelInfo(model: string): EmbeddingModel | null {
    return this.models.get(model) || null;
  }
}

/**
 * Options for embedding service.
 */
export interface EmbeddingServiceOptions {
  provider?: EmbeddingProvider;
  defaultModel?: string;
  batchSize?: number;
  cacheEnabled?: boolean;
  cacheMaxSize?: number;
}

/**
 * Cached embedding entry.
 */
interface CachedEmbedding {
  embedding: number[];
  model: string;
  timestamp: Date;
}

/**
 * Embedding Service for generating text embeddings.
 */
export class EmbeddingService {
  private provider: EmbeddingProvider;
  private defaultModel: string;
  private batchSize: number;
  private cache: Map<string, CachedEmbedding> = new Map();
  private cacheEnabled: boolean;
  private cacheMaxSize: number;
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
  };

  constructor(options?: EmbeddingServiceOptions) {
    this.provider = options?.provider || new MockEmbeddingProvider();
    this.defaultModel = options?.defaultModel || 'nomic-embed-text';
    this.batchSize = options?.batchSize || 32;
    this.cacheEnabled = options?.cacheEnabled ?? true;
    this.cacheMaxSize = options?.cacheMaxSize || 10000;
  }

  /**
   * Embed a single text.
   */
  async embedText(text: string, model?: string): Promise<number[]> {
    const result = await this.embedTexts([text], model);
    return result.embeddings[0];
  }

  /**
   * Embed multiple texts.
   */
  async embedTexts(
    texts: string[],
    model?: string
  ): Promise<EmbeddingResult> {
    const modelId = model || this.defaultModel;
    const startTime = Date.now();

    this.stats.totalRequests++;

    // Check cache
    const results: (number[] | null)[] = texts.map((text) => {
      if (this.cacheEnabled) {
        const cached = this.getFromCache(text, modelId);
        if (cached) {
          this.stats.cacheHits++;
          return cached;
        }
        this.stats.cacheMisses++;
      }
      return null;
    });

    // Find texts that need embedding
    const textsToEmbed: { index: number; text: string }[] = [];
    for (let i = 0; i < texts.length; i++) {
      if (results[i] === null) {
        textsToEmbed.push({ index: i, text: texts[i] });
      }
    }

    // Embed uncached texts in batches
    if (textsToEmbed.length > 0) {
      const batches = this.createBatches(textsToEmbed, this.batchSize);

      for (const batch of batches) {
        const batchTexts = batch.map((item) => item.text);
        const embeddings = await this.provider.embed(batchTexts, modelId);

        // Store results and cache
        for (let i = 0; i < batch.length; i++) {
          const embedding = embeddings[i];
          results[batch[i].index] = embedding;

          if (this.cacheEnabled) {
            this.addToCache(batch[i].text, modelId, embedding);
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    this.stats.totalLatencyMs += latencyMs;

    // Estimate tokens (rough: 1 token ≈ 4 chars)
    const totalTokens = texts.reduce(
      (sum, text) => sum + Math.ceil(text.length / 4),
      0
    );
    this.stats.totalTokens += totalTokens;

    const modelInfo = this.provider.getModelInfo(modelId);

    return {
      embeddings: results as number[][],
      model: modelId,
      dimensions: modelInfo?.dimensions || 768,
      usage: {
        promptTokens: totalTokens,
        completionTokens: 0,
        totalTokens,
      },
      latencyMs,
    };
  }

  /**
   * Embed texts from an EmbeddingRequest.
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    return this.embedTexts(request.texts, request.model);
  }

  /**
   * Calculate cosine similarity between two embeddings.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Find most similar texts to a query.
   */
  async findSimilar(
    query: string,
    documents: string[],
    options?: {
      model?: string;
      topK?: number;
      threshold?: number;
    }
  ): Promise<{ index: number; document: string; score: number }[]> {
    const topK = options?.topK || 5;
    const threshold = options?.threshold || 0;

    // Embed query and documents
    const queryEmbedding = await this.embedText(query, options?.model);
    const docEmbeddings = await this.embedTexts(documents, options?.model);

    // Calculate similarities
    const similarities: { index: number; document: string; score: number }[] = [];
    for (let i = 0; i < documents.length; i++) {
      const score = this.cosineSimilarity(queryEmbedding, docEmbeddings.embeddings[i]);
      if (score >= threshold) {
        similarities.push({
          index: i,
          document: documents[i],
          score,
        });
      }
    }

    // Sort by score descending and take top K
    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, topK);
  }

  /**
   * Get cache key for a text and model.
   */
  private getCacheKey(text: string, model: string): string {
    // Simple hash for cache key
    let hash = 0;
    const str = `${model}:${text}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get embedding from cache.
   */
  private getFromCache(text: string, model: string): number[] | null {
    const key = this.getCacheKey(text, model);
    const cached = this.cache.get(key);
    return cached?.embedding || null;
  }

  /**
   * Add embedding to cache.
   */
  private addToCache(text: string, model: string, embedding: number[]): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.getCacheKey(text, model);
    this.cache.set(key, {
      embedding,
      model,
      timestamp: new Date(),
    });
  }

  /**
   * Create batches from items.
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hitRate: total > 0 ? (this.stats.cacheHits / total) * 100 : 0,
    };
  }

  /**
   * Get service statistics.
   */
  getStats(): {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    totalTokens: number;
    averageLatencyMs: number;
  } {
    return {
      ...this.stats,
      averageLatencyMs:
        this.stats.totalRequests > 0
          ? this.stats.totalLatencyMs / this.stats.totalRequests
          : 0,
    };
  }

  /**
   * Get available embedding models.
   */
  getAvailableModels(): EmbeddingModel[] {
    return [...DEFAULT_EMBEDDING_MODELS];
  }

  /**
   * Get model info.
   */
  getModelInfo(model: string): EmbeddingModel | null {
    return this.provider.getModelInfo(model);
  }

  /**
   * Set default model.
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }

  /**
   * Get default model.
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

/**
 * Create an embedding service with default configuration.
 */
export function createEmbeddingService(
  options?: EmbeddingServiceOptions
): EmbeddingService {
  return new EmbeddingService(options);
}

/**
 * Utility: Normalize an embedding vector.
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  if (magnitude === 0) return embedding;
  return embedding.map((val) => val / magnitude);
}

/**
 * Utility: Calculate Euclidean distance between embeddings.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Utility: Calculate dot product of embeddings.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

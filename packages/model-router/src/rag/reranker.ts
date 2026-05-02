// ===========================================
// Reranker Service for Algora v2.0
// ===========================================

import type {
  RerankerModel,
  RerankRequest,
  RerankResult,
  RankedDocument,
} from '../types.js';
import { DEFAULT_RERANKER_MODELS } from '../types.js';

/**
 * Reranker provider interface.
 */
export interface RerankerProvider {
  rerank(query: string, documents: string[], model: string): Promise<RankedDocument[]>;
  getModelInfo(model: string): RerankerModel | null;
}

/**
 * Mock reranker provider for testing.
 * Uses simple keyword overlap scoring.
 */
export class MockRerankerProvider implements RerankerProvider {
  private models: Map<string, RerankerModel> = new Map();

  constructor() {
    for (const model of DEFAULT_RERANKER_MODELS) {
      this.models.set(model.id, model);
    }
  }

  async rerank(
    query: string,
    documents: string[],
    _model: string
  ): Promise<RankedDocument[]> {
    // Simple keyword-based scoring for mock
    const queryWords = new Set(
      query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    );

    const scored = documents.map((doc, index) => {
      const docWords = doc.toLowerCase().split(/\s+/);
      let matchCount = 0;

      for (const word of docWords) {
        if (queryWords.has(word)) {
          matchCount++;
        }
      }

      // Calculate relevance score (0-1)
      const score = matchCount / Math.max(queryWords.size, 1);

      return {
        index,
        document: doc,
        score: Math.min(1, score * 1.5), // Boost and cap at 1
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  getModelInfo(model: string): RerankerModel | null {
    return this.models.get(model) || null;
  }
}

/**
 * Options for reranker service.
 */
export interface RerankerServiceOptions {
  provider?: RerankerProvider;
  defaultModel?: string;
  defaultTopK?: number;
  minScore?: number;
}

/**
 * Reranker Service for improving retrieval quality.
 */
export class RerankerService {
  private provider: RerankerProvider;
  private defaultModel: string;
  private defaultTopK: number;
  private minScore: number;
  private stats = {
    totalRequests: 0,
    totalDocuments: 0,
    totalLatencyMs: 0,
    averageDocsPerRequest: 0,
  };

  constructor(options?: RerankerServiceOptions) {
    this.provider = options?.provider || new MockRerankerProvider();
    this.defaultModel = options?.defaultModel || 'qwen3.5:4b';
    this.defaultTopK = options?.defaultTopK || 10;
    this.minScore = options?.minScore || 0;
  }

  /**
   * Rerank documents by relevance to a query.
   */
  async rerank(request: RerankRequest): Promise<RerankResult> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;
    const topK = request.topK || this.defaultTopK;

    this.stats.totalRequests++;
    this.stats.totalDocuments += request.documents.length;

    // Get rankings from provider
    let rankings = await this.provider.rerank(
      request.query,
      request.documents,
      model
    );

    // Filter by minimum score
    if (this.minScore > 0) {
      rankings = rankings.filter((r) => r.score >= this.minScore);
    }

    // Take top K
    rankings = rankings.slice(0, topK);

    const latencyMs = Date.now() - startTime;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.averageDocsPerRequest =
      this.stats.totalDocuments / this.stats.totalRequests;

    return {
      rankings,
      model,
      latencyMs,
    };
  }

  /**
   * Rerank and return only the documents.
   */
  async rerankDocuments(
    query: string,
    documents: string[],
    options?: {
      model?: string;
      topK?: number;
    }
  ): Promise<string[]> {
    const result = await this.rerank({
      query,
      documents,
      model: options?.model,
      topK: options?.topK,
    });

    return result.rankings.map((r) => r.document);
  }

  /**
   * Rerank and return documents with scores.
   */
  async rerankWithScores(
    query: string,
    documents: string[],
    options?: {
      model?: string;
      topK?: number;
    }
  ): Promise<{ document: string; score: number }[]> {
    const result = await this.rerank({
      query,
      documents,
      model: options?.model,
      topK: options?.topK,
    });

    return result.rankings.map((r) => ({
      document: r.document,
      score: r.score,
    }));
  }

  /**
   * Get the most relevant document.
   */
  async getMostRelevant(
    query: string,
    documents: string[],
    model?: string
  ): Promise<{ document: string; score: number; index: number } | null> {
    const result = await this.rerank({
      query,
      documents,
      model,
      topK: 1,
    });

    if (result.rankings.length === 0) {
      return null;
    }

    const top = result.rankings[0];
    return {
      document: top.document,
      score: top.score,
      index: top.index,
    };
  }

  /**
   * Filter documents by relevance threshold.
   */
  async filterRelevant(
    query: string,
    documents: string[],
    options?: {
      model?: string;
      threshold?: number;
    }
  ): Promise<{ document: string; score: number }[]> {
    const threshold = options?.threshold || 0.5;

    const result = await this.rerank({
      query,
      documents,
      model: options?.model,
      topK: documents.length, // Get all
    });

    return result.rankings
      .filter((r) => r.score >= threshold)
      .map((r) => ({
        document: r.document,
        score: r.score,
      }));
  }

  /**
   * Reciprocal Rank Fusion for combining multiple ranking lists.
   */
  reciprocalRankFusion(
    rankingLists: RankedDocument[][],
    k: number = 60
  ): RankedDocument[] {
    // Collect all unique documents
    const documentScores = new Map<
      number,
      { document: string; score: number }
    >();

    for (const rankings of rankingLists) {
      for (let rank = 0; rank < rankings.length; rank++) {
        const item = rankings[rank];
        const rrfScore = 1 / (k + rank + 1);

        const existing = documentScores.get(item.index);
        if (existing) {
          existing.score += rrfScore;
        } else {
          documentScores.set(item.index, {
            document: item.document,
            score: rrfScore,
          });
        }
      }
    }

    // Convert to array and sort
    const fused: RankedDocument[] = [];
    for (const [index, { document, score }] of documentScores) {
      fused.push({ index, document, score });
    }

    fused.sort((a, b) => b.score - a.score);
    return fused;
  }

  /**
   * Get service statistics.
   */
  getStats(): {
    totalRequests: number;
    totalDocuments: number;
    averageLatencyMs: number;
    averageDocsPerRequest: number;
  } {
    return {
      totalRequests: this.stats.totalRequests,
      totalDocuments: this.stats.totalDocuments,
      averageLatencyMs:
        this.stats.totalRequests > 0
          ? this.stats.totalLatencyMs / this.stats.totalRequests
          : 0,
      averageDocsPerRequest: this.stats.averageDocsPerRequest,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalDocuments: 0,
      totalLatencyMs: 0,
      averageDocsPerRequest: 0,
    };
  }

  /**
   * Get available reranker models.
   */
  getAvailableModels(): RerankerModel[] {
    return [...DEFAULT_RERANKER_MODELS];
  }

  /**
   * Get model info.
   */
  getModelInfo(model: string): RerankerModel | null {
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

  /**
   * Set default top K.
   */
  setDefaultTopK(topK: number): void {
    this.defaultTopK = topK;
  }

  /**
   * Set minimum score threshold.
   */
  setMinScore(minScore: number): void {
    this.minScore = minScore;
  }
}

/**
 * Create a reranker service with default configuration.
 */
export function createRerankerService(
  options?: RerankerServiceOptions
): RerankerService {
  return new RerankerService(options);
}

/**
 * RAG Pipeline combining embeddings and reranking.
 */
export interface RAGPipelineOptions {
  embeddingService: {
    findSimilar: (
      query: string,
      documents: string[],
      options?: { topK?: number }
    ) => Promise<{ document: string; score: number }[]>;
  };
  rerankerService: RerankerService;
  embeddingTopK?: number;
  rerankerTopK?: number;
  useReranking?: boolean;
}

/**
 * Simple RAG pipeline combining embedding retrieval and reranking.
 */
export async function ragPipeline(
  query: string,
  documents: string[],
  options: RAGPipelineOptions
): Promise<{ document: string; score: number }[]> {
  const embeddingTopK = options.embeddingTopK || 20;
  const rerankerTopK = options.rerankerTopK || 5;
  const useReranking = options.useReranking ?? true;

  // Step 1: Embedding-based retrieval
  const embeddingResults = await options.embeddingService.findSimilar(
    query,
    documents,
    { topK: embeddingTopK }
  );

  if (!useReranking) {
    return embeddingResults.slice(0, rerankerTopK);
  }

  // Step 2: Reranking
  const candidateDocs = embeddingResults.map((r) => r.document);
  const rerankedResults = await options.rerankerService.rerankWithScores(
    query,
    candidateDocs,
    { topK: rerankerTopK }
  );

  return rerankedResults;
}

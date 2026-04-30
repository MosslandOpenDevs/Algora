/**
 * RAG Service - Retrieval Augmented Generation for Governance Documents
 *
 * Provides:
 * - Document embedding and storage (SQLite-backed)
 * - Semantic search across governance documents
 * - Context enrichment for LLM responses
 */

import type Database from 'better-sqlite3';
import type { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'proposal' | 'issue' | 'signal' | 'agora_message' | 'decision_packet' | 'disclosure';
    sourceId: string;
    title?: string;
    createdAt: string;
    tags?: string[];
  };
  embedding?: number[];
  createdAt: Date;
}

export interface RAGSearchResult {
  document: RAGDocument;
  score: number;
  rank: number;
}

export interface RAGConfig {
  embeddingModel: string;
  embeddingEndpoint: string;
  embeddingDimensions: number;
  maxDocumentLength: number;
  defaultTopK: number;
  similarityThreshold: number;
}

// ============================================
// Ollama Embedding Provider
// ============================================

async function generateOllamaEmbedding(
  text: string,
  endpoint: string,
  model: string
): Promise<number[]> {
  const response = await fetch(`${endpoint}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

// ============================================
// Similarity Functions
// ============================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================
// RAG Service
// ============================================

export class RAGService {
  private db: Database.Database;
  private io: SocketServer;
  private config: RAGConfig;
  private isAvailable: boolean = false;
  private embeddingCache: Map<string, number[]> = new Map();
  private stats = {
    documentsIndexed: 0,
    searchesPerformed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageSearchLatencyMs: 0,
  };

  constructor(db: Database.Database, io: SocketServer, config?: Partial<RAGConfig>) {
    this.db = db;
    this.io = io;
    this.config = {
      embeddingModel: config?.embeddingModel || process.env.RAG_EMBEDDING_MODEL || 'nomic-embed-text',
      embeddingEndpoint: config?.embeddingEndpoint || process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434',
      embeddingDimensions: config?.embeddingDimensions || 768, // nomic-embed-text default
      maxDocumentLength: config?.maxDocumentLength || 8192,
      defaultTopK: config?.defaultTopK || 5,
      similarityThreshold: config?.similarityThreshold || 0.3,
    };

    this.initTable();
    this.checkAvailability();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rag_documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        embedding BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_rag_doc_type ON rag_documents(
        JSON_EXTRACT(metadata, '$.type')
      );
      CREATE INDEX IF NOT EXISTS idx_rag_doc_source ON rag_documents(
        JSON_EXTRACT(metadata, '$.sourceId')
      );
      CREATE INDEX IF NOT EXISTS idx_rag_created ON rag_documents(created_at);
    `);

    // Count existing documents
    const count = this.db.prepare('SELECT COUNT(*) as count FROM rag_documents').get() as { count: number };
    this.stats.documentsIndexed = count.count;
  }

  private async checkAvailability(): Promise<void> {
    try {
      // Test embedding endpoint
      const response = await fetch(`${this.config.embeddingEndpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as { models?: { name: string }[] };
        const models = data.models || [];
        this.isAvailable = models.some(m => m.name.includes('embed'));

        if (!this.isAvailable) {
          console.warn('[RAG] No embedding model found. Run: ollama pull nomic-embed-text');
        } else {
          console.info(`[RAG] Service available with model: ${this.config.embeddingModel}`);
        }
      }
    } catch (error) {
      console.warn('[RAG] Embedding service not available:', error);
      this.isAvailable = false;
    }
  }

  /**
   * Check if RAG service is available
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Index a document for semantic search
   */
  async indexDocument(doc: Omit<RAGDocument, 'id' | 'embedding' | 'createdAt'>): Promise<RAGDocument> {
    const id = uuidv4();
    const now = new Date();

    // Truncate content if too long
    const content = doc.content.length > this.config.maxDocumentLength
      ? doc.content.substring(0, this.config.maxDocumentLength)
      : doc.content;

    // Generate embedding
    let embedding: number[] | undefined;
    if (this.isAvailable) {
      try {
        embedding = await this.getEmbedding(content);
      } catch (error) {
        console.error('[RAG] Failed to generate embedding:', error);
      }
    }

    const ragDoc: RAGDocument = {
      id,
      content,
      metadata: doc.metadata,
      embedding,
      createdAt: now,
    };

    // Store in database
    this.db.prepare(`
      INSERT INTO rag_documents (id, content, metadata, embedding, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      content,
      JSON.stringify(doc.metadata),
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
      now.toISOString()
    );

    this.stats.documentsIndexed++;

    // Emit event
    this.io.emit('rag:document:indexed', {
      id,
      type: doc.metadata.type,
      sourceId: doc.metadata.sourceId,
      timestamp: now.toISOString(),
    });

    return ragDoc;
  }

  /**
   * Index multiple documents
   */
  async indexDocuments(docs: Omit<RAGDocument, 'id' | 'embedding' | 'createdAt'>[]): Promise<RAGDocument[]> {
    const results: RAGDocument[] = [];

    for (const doc of docs) {
      try {
        const indexed = await this.indexDocument(doc);
        results.push(indexed);
      } catch (error) {
        console.error('[RAG] Failed to index document:', error);
      }
    }

    return results;
  }

  /**
   * Search documents by semantic similarity
   */
  async search(query: string, options?: {
    topK?: number;
    type?: RAGDocument['metadata']['type'];
    minScore?: number;
  }): Promise<RAGSearchResult[]> {
    const startTime = Date.now();
    const topK = options?.topK || this.config.defaultTopK;
    const minScore = options?.minScore || this.config.similarityThreshold;

    if (!this.isAvailable) {
      // Fallback to keyword search
      return this.keywordSearch(query, topK, options?.type);
    }

    try {
      // Generate query embedding
      const queryEmbedding = await this.getEmbedding(query);

      // Get all documents with embeddings
      let sql = 'SELECT * FROM rag_documents WHERE embedding IS NOT NULL';
      const params: unknown[] = [];

      if (options?.type) {
        sql += ` AND JSON_EXTRACT(metadata, '$.type') = ?`;
        params.push(options.type);
      }

      const rows = this.db.prepare(sql).all(...params) as Array<{
        id: string;
        content: string;
        metadata: string;
        embedding: Buffer;
        created_at: string;
      }>;

      // Calculate similarities
      const results: RAGSearchResult[] = [];

      for (const row of rows) {
        const embedding = Array.from(new Float32Array(row.embedding.buffer.slice(
          row.embedding.byteOffset,
          row.embedding.byteOffset + row.embedding.byteLength
        )));

        const score = cosineSimilarity(queryEmbedding, embedding);

        if (score >= minScore) {
          results.push({
            document: {
              id: row.id,
              content: row.content,
              metadata: JSON.parse(row.metadata),
              embedding,
              createdAt: new Date(row.created_at),
            },
            score,
            rank: 0,
          });
        }
      }

      // Sort by score and assign ranks
      results.sort((a, b) => b.score - a.score);
      results.forEach((r, i) => r.rank = i + 1);

      // Update stats
      this.stats.searchesPerformed++;
      const latencyMs = Date.now() - startTime;
      this.stats.averageSearchLatencyMs = (this.stats.averageSearchLatencyMs + latencyMs) / 2;

      return results.slice(0, topK);
    } catch (error) {
      console.error('[RAG] Search failed, falling back to keyword search:', error);
      return this.keywordSearch(query, topK, options?.type);
    }
  }

  /**
   * Keyword-based fallback search
   */
  private keywordSearch(
    query: string,
    topK: number,
    type?: RAGDocument['metadata']['type']
  ): RAGSearchResult[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);

    let sql = 'SELECT * FROM rag_documents WHERE 1=1';
    const params: unknown[] = [];

    if (type) {
      sql += ` AND JSON_EXTRACT(metadata, '$.type') = ?`;
      params.push(type);
    }

    // Build keyword search conditions
    if (keywords.length > 0) {
      const keywordConditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
      sql += ` AND (${keywordConditions})`;
      params.push(...keywords.map(k => `%${k}%`));
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(topK * 2); // Get more for scoring

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      content: string;
      metadata: string;
      embedding: Buffer | null;
      created_at: string;
    }>;

    // Score by keyword frequency
    const results: RAGSearchResult[] = rows.map(row => {
      const contentLower = row.content.toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        const matches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
        score += matches * (1 / keywords.length);
      }
      // Normalize score
      score = Math.min(score / 10, 1);

      return {
        document: {
          id: row.id,
          content: row.content,
          metadata: JSON.parse(row.metadata),
          embedding: row.embedding
            ? Array.from(new Float32Array(row.embedding.buffer.slice(
                row.embedding.byteOffset,
                row.embedding.byteOffset + row.embedding.byteLength
              )))
            : undefined,
          createdAt: new Date(row.created_at),
        },
        score,
        rank: 0,
      };
    });

    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => r.rank = i + 1);

    return results.slice(0, topK);
  }

  /**
   * Get embedding for text (with caching)
   */
  private async getEmbedding(text: string): Promise<number[]> {
    // Check cache
    const cacheKey = text.substring(0, 200); // Use prefix as key
    if (this.embeddingCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.embeddingCache.get(cacheKey)!;
    }

    this.stats.cacheMisses++;

    const embedding = await generateOllamaEmbedding(
      text,
      this.config.embeddingEndpoint,
      this.config.embeddingModel
    );

    // Cache (limit size)
    if (this.embeddingCache.size > 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) this.embeddingCache.delete(firstKey);
    }
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Get document by ID
   */
  getDocument(id: string): RAGDocument | null {
    const row = this.db.prepare('SELECT * FROM rag_documents WHERE id = ?').get(id) as {
      id: string;
      content: string;
      metadata: string;
      embedding: Buffer | null;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer.slice(
            row.embedding.byteOffset,
            row.embedding.byteOffset + row.embedding.byteLength
          )))
        : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Get document by source ID
   */
  getDocumentBySourceId(sourceId: string): RAGDocument | null {
    const row = this.db.prepare(
      `SELECT * FROM rag_documents WHERE JSON_EXTRACT(metadata, '$.sourceId') = ?`
    ).get(sourceId) as {
      id: string;
      content: string;
      metadata: string;
      embedding: Buffer | null;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer.slice(
            row.embedding.byteOffset,
            row.embedding.byteOffset + row.embedding.byteLength
          )))
        : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Delete a document
   */
  deleteDocument(id: string): boolean {
    const result = this.db.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
    if (result.changes > 0) {
      this.stats.documentsIndexed--;
      return true;
    }
    return false;
  }

  /**
   * Get related context for a query
   * This is the main entry point for enriching LLM context
   */
  async getContext(query: string, options?: {
    topK?: number;
    types?: RAGDocument['metadata']['type'][];
  }): Promise<string> {
    const topK = options?.topK || 3;
    const results: RAGSearchResult[] = [];

    // Search each type if specified, otherwise search all
    if (options?.types && options.types.length > 0) {
      for (const type of options.types) {
        const typeResults = await this.search(query, { topK: Math.ceil(topK / options.types.length), type });
        results.push(...typeResults);
      }
    } else {
      const allResults = await this.search(query, { topK });
      results.push(...allResults);
    }

    // Sort by score and take top K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    if (topResults.length === 0) {
      return '';
    }

    // Format as context string
    const contextParts = topResults.map((r, i) => {
      const meta = r.document.metadata;
      const header = `[${i + 1}] ${meta.type.toUpperCase()}: ${meta.title || meta.sourceId} (relevance: ${(r.score * 100).toFixed(0)}%)`;
      const content = r.document.content.length > 500
        ? r.document.content.substring(0, 500) + '...'
        : r.document.content;
      return `${header}\n${content}`;
    });

    return `Related context from governance documents:\n\n${contextParts.join('\n\n---\n\n')}`;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    available: boolean;
    config: RAGConfig;
    stats: {
      documentsIndexed: number;
      searchesPerformed: number;
      cacheHits: number;
      cacheMisses: number;
      averageSearchLatencyMs: number;
    };
  } {
    return {
      available: this.isAvailable,
      config: this.config,
      stats: { ...this.stats },
    };
  }

  /**
   * Clear all documents
   */
  clearAll(): void {
    this.db.prepare('DELETE FROM rag_documents').run();
    this.embeddingCache.clear();
    this.stats.documentsIndexed = 0;
    console.info('[RAG] All documents cleared');
  }

  /**
   * Re-index all documents (regenerate embeddings)
   */
  async reindexAll(): Promise<number> {
    if (!this.isAvailable) {
      throw new Error('RAG service not available');
    }

    const rows = this.db.prepare('SELECT id, content FROM rag_documents').all() as Array<{
      id: string;
      content: string;
    }>;

    let reindexed = 0;

    for (const row of rows) {
      try {
        const embedding = await this.getEmbedding(row.content);
        this.db.prepare(
          'UPDATE rag_documents SET embedding = ?, updated_at = ? WHERE id = ?'
        ).run(
          Buffer.from(new Float32Array(embedding).buffer),
          new Date().toISOString(),
          row.id
        );
        reindexed++;
      } catch (error) {
        console.error(`[RAG] Failed to reindex document ${row.id}:`, error);
      }
    }

    console.info(`[RAG] Reindexed ${reindexed}/${rows.length} documents`);
    return reindexed;
  }
}

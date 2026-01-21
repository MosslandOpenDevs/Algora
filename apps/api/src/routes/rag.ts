import { Router } from 'express';
import type { Request, Response } from 'express';
import type { RAGService, RAGDocument } from '../services/rag-service';

export const ragRouter: Router = Router();

// GET /api/rag/status - Get RAG service status
ragRouter.get('/status', (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  const stats = service.getStats();
  res.json(stats);
});

// POST /api/rag/search - Search documents
ragRouter.post('/search', async (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  try {
    const { query, topK, type, minScore } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await service.search(query, {
      topK: topK ? Number(topK) : undefined,
      type: type as RAGDocument['metadata']['type'],
      minScore: minScore ? Number(minScore) : undefined,
    });

    res.json({
      query,
      results: results.map(r => ({
        id: r.document.id,
        content: r.document.content.substring(0, 500) + (r.document.content.length > 500 ? '...' : ''),
        metadata: r.document.metadata,
        score: r.score,
        rank: r.rank,
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('[RAG] Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/rag/context - Get context for query
ragRouter.post('/context', async (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  try {
    const { query, topK, types } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const context = await service.getContext(query, {
      topK: topK ? Number(topK) : undefined,
      types: types as RAGDocument['metadata']['type'][],
    });

    res.json({
      query,
      context,
      hasContext: context.length > 0,
    });
  } catch (error) {
    console.error('[RAG] Context retrieval failed:', error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// POST /api/rag/index - Index a document
ragRouter.post('/index', async (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  try {
    const { content, type, sourceId, title, tags } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    if (!type || !['proposal', 'issue', 'signal', 'agora_message', 'decision_packet', 'disclosure'].includes(type)) {
      return res.status(400).json({ error: 'Valid type is required' });
    }

    if (!sourceId || typeof sourceId !== 'string') {
      return res.status(400).json({ error: 'sourceId is required' });
    }

    const doc = await service.indexDocument({
      content,
      metadata: {
        type,
        sourceId,
        title,
        createdAt: new Date().toISOString(),
        tags,
      },
    });

    res.status(201).json({
      id: doc.id,
      hasEmbedding: !!doc.embedding,
      metadata: doc.metadata,
    });
  } catch (error) {
    console.error('[RAG] Index failed:', error);
    res.status(500).json({ error: 'Failed to index document' });
  }
});

// POST /api/rag/index/batch - Index multiple documents
ragRouter.post('/index/batch', async (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  try {
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'Documents array is required' });
    }

    const docs = documents.map((d: {
      content: string;
      type: string;
      sourceId: string;
      title?: string;
      tags?: string[];
    }) => ({
      content: d.content,
      metadata: {
        type: d.type as RAGDocument['metadata']['type'],
        sourceId: d.sourceId,
        title: d.title,
        createdAt: new Date().toISOString(),
        tags: d.tags,
      },
    }));

    const indexed = await service.indexDocuments(docs);

    res.status(201).json({
      indexed: indexed.length,
      documents: indexed.map(d => ({
        id: d.id,
        sourceId: d.metadata.sourceId,
        hasEmbedding: !!d.embedding,
      })),
    });
  } catch (error) {
    console.error('[RAG] Batch index failed:', error);
    res.status(500).json({ error: 'Failed to index documents' });
  }
});

// GET /api/rag/document/:id - Get document by ID
ragRouter.get('/document/:id', (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  const { id } = req.params;
  const doc = service.getDocument(id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({
    id: doc.id,
    content: doc.content,
    metadata: doc.metadata,
    hasEmbedding: !!doc.embedding,
    createdAt: doc.createdAt.toISOString(),
  });
});

// GET /api/rag/document/source/:sourceId - Get document by source ID
ragRouter.get('/document/source/:sourceId', (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  const { sourceId } = req.params;
  const doc = service.getDocumentBySourceId(sourceId);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({
    id: doc.id,
    content: doc.content,
    metadata: doc.metadata,
    hasEmbedding: !!doc.embedding,
    createdAt: doc.createdAt.toISOString(),
  });
});

// DELETE /api/rag/document/:id - Delete document
ragRouter.delete('/document/:id', (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  const { id } = req.params;
  const deleted = service.deleteDocument(id);

  if (!deleted) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({ success: true, id });
});

// POST /api/rag/reindex - Re-index all documents
ragRouter.post('/reindex', async (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  try {
    const reindexed = await service.reindexAll();
    res.json({
      success: true,
      reindexed,
    });
  } catch (error) {
    console.error('[RAG] Reindex failed:', error);
    res.status(500).json({ error: 'Failed to reindex documents' });
  }
});

// DELETE /api/rag/clear - Clear all documents
ragRouter.delete('/clear', (req: Request, res: Response) => {
  const service: RAGService | undefined = req.app.locals.ragService;

  if (!service) {
    return res.status(503).json({ error: 'RAG service not available' });
  }

  service.clearAll();
  res.json({ success: true, message: 'All RAG documents cleared' });
});

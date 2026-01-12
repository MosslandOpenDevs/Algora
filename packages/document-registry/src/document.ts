// ===========================================
// Document Management for Algora v2.0
// ===========================================

import type {
  Document,
  DocumentType,
  DocumentState,
  DocumentVersion,
  DocumentQuery,
  DocumentQueryResult,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentRegistryConfig,
  DocumentProvenance,
  AgentContribution,
} from './types.js';
import {
  DEFAULT_DOCUMENT_REGISTRY_CONFIG,
  DOCUMENT_STATE_TRANSITIONS,
  generateDocumentId,
  incrementVersion,
} from './types.js';

/**
 * Error thrown for document validation failures.
 */
export class DocumentValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string
  ) {
    super(`Validation failed for ${field}: ${reason}`);
    this.name = 'DocumentValidationError';
  }
}

/**
 * Error thrown for invalid state transitions.
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly documentId: string,
    public readonly fromState: DocumentState,
    public readonly toState: DocumentState
  ) {
    super(`Invalid state transition from ${fromState} to ${toState} for document ${documentId}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Error thrown when document is not found.
 */
export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
  }
}

/**
 * Storage interface for documents.
 */
export interface DocumentStorage {
  save(document: Document): Promise<void>;
  get(id: string): Promise<Document | null>;
  delete(id: string): Promise<void>;
  query(query: DocumentQuery): Promise<DocumentQueryResult>;
  getNextSequence(type: DocumentType, date: Date): Promise<number>;
  getVersionHistory(id: string): Promise<Document[]>;
  saveVersion(document: Document): Promise<void>;
}

/**
 * In-memory document storage implementation.
 */
export class InMemoryDocumentStorage implements DocumentStorage {
  private documents: Map<string, Document> = new Map();
  private versions: Map<string, Document[]> = new Map();
  private sequences: Map<string, number> = new Map();

  async save(document: Document): Promise<void> {
    this.documents.set(document.id, document);
  }

  async get(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async query(query: DocumentQuery): Promise<DocumentQueryResult> {
    let results = Array.from(this.documents.values());

    // Apply filters
    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      results = results.filter((d) => types.includes(d.type));
    }

    if (query.state) {
      const states = Array.isArray(query.state) ? query.state : [query.state];
      results = results.filter((d) => states.includes(d.state));
    }

    if (query.language) {
      results = results.filter((d) => d.language === query.language);
    }

    if (query.accessLevel) {
      results = results.filter((d) => d.accessLevel === query.accessLevel);
    }

    if (query.createdBy) {
      results = results.filter((d) => d.createdBy === query.createdBy);
    }

    if (query.createdAfter) {
      results = results.filter((d) => d.createdAt >= query.createdAfter!);
    }

    if (query.createdBefore) {
      results = results.filter((d) => d.createdAt <= query.createdBefore!);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter((d) =>
        query.tags!.some((tag) => d.tags.includes(tag))
      );
    }

    if (query.issueId) {
      results = results.filter((d) => d.issueId === query.issueId);
    }

    if (query.parentDocumentId) {
      results = results.filter((d) =>
        d.parentDocuments.includes(query.parentDocumentId!)
      );
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      results = results.filter(
        (d) =>
          d.title.toLowerCase().includes(searchLower) ||
          d.summary.toLowerCase().includes(searchLower) ||
          d.content.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    results.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'createdAt') {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      } else if (sortBy === 'modifiedAt') {
        comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime();
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Paginate
    const total = results.length;
    const limit = query.limit || 20;
    const offset = query.offset || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      documents: paginatedResults,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async getNextSequence(type: DocumentType, date: Date): Promise<number> {
    const key = `${type}-${date.toISOString().slice(0, 10)}`;
    const current = this.sequences.get(key) || 0;
    const next = current + 1;
    this.sequences.set(key, next);
    return next;
  }

  async getVersionHistory(id: string): Promise<Document[]> {
    return this.versions.get(id) || [];
  }

  async saveVersion(document: Document): Promise<void> {
    const versions = this.versions.get(document.id) || [];
    versions.push(document);
    this.versions.set(document.id, versions);
  }
}

/**
 * Document event listener type.
 */
export type DocumentEventListener = (
  event: string,
  data: Record<string, unknown>
) => void;

/**
 * Options for the document manager.
 */
export interface DocumentManagerOptions {
  config?: DocumentRegistryConfig;
  storage?: DocumentStorage;
}

/**
 * Document Manager for CRUD operations.
 */
export class DocumentManager {
  private config: DocumentRegistryConfig;
  private storage: DocumentStorage;
  private listeners: DocumentEventListener[] = [];

  constructor(options?: DocumentManagerOptions) {
    this.config = options?.config || DEFAULT_DOCUMENT_REGISTRY_CONFIG;
    this.storage = options?.storage || new InMemoryDocumentStorage();
  }

  /**
   * Create a new document.
   */
  async create(input: CreateDocumentInput): Promise<Document> {
    // Validate input
    this.validateCreateInput(input);

    // Generate ID
    const now = new Date();
    const sequence = await this.storage.getNextSequence(input.type, now);
    const id = generateDocumentId(input.type, now, sequence);

    // Create initial version
    const version: DocumentVersion = { major: 1, minor: 0, patch: 0 };

    // Calculate content hash
    const contentHash = this.hashContent(input.content);

    // Build provenance
    const provenance: DocumentProvenance = {
      documentId: id,
      documentType: input.type,
      version,
      createdAt: now,
      createdBy: input.createdBy,
      modifiedAt: now,
      modifiedBy: input.createdBy,
      sourceSignals: [],
      parentDocuments: input.parentDocuments || [],
      issueId: input.issueId,
      contentHash,
      contentSize: input.content.length,
      agentContributions: input.agentContributions || [],
      reviewHistory: [],
      approvalStatus: 'DRAFT',
    };

    // Create document
    const document: Document = {
      id,
      type: input.type,
      title: input.title,
      summary: input.summary,
      content: input.content,
      version,
      state: 'draft',
      createdAt: now,
      createdBy: input.createdBy,
      modifiedAt: now,
      modifiedBy: input.createdBy,
      issueId: input.issueId,
      parentDocuments: input.parentDocuments || [],
      childDocuments: [],
      language: input.language || 'en',
      hasTranslation: false,
      contentHash,
      contentSize: input.content.length,
      accessLevel: input.accessLevel || 'public',
      reviewRequired: false,
      tags: input.tags || [],
      categories: input.categories || [],
      mentionedAgents: [],
      mentionedProposals: [],
      provenance,
    };

    // Save document
    await this.storage.save(document);

    // Emit event
    this.emit('document:created', { document });

    return document;
  }

  /**
   * Get a document by ID.
   */
  async get(id: string): Promise<Document> {
    const document = await this.storage.get(id);
    if (!document) {
      throw new DocumentNotFoundError(id);
    }

    // Log access if configured
    if (this.config.logAccess) {
      this.emit('document:accessed', { documentId: id });
    }

    return document;
  }

  /**
   * Get a document by ID, returning null if not found.
   */
  async getOrNull(id: string): Promise<Document | null> {
    return this.storage.get(id);
  }

  /**
   * Update a document.
   */
  async update(id: string, input: UpdateDocumentInput): Promise<Document> {
    const document = await this.get(id);

    // Validate state allows updates
    if (document.state === 'archived' || document.state === 'superseded') {
      throw new DocumentValidationError(
        'state',
        `Cannot update document in ${document.state} state`
      );
    }

    // Validate input
    if (input.title) {
      this.validateTitle(input.title);
    }
    if (input.summary) {
      this.validateSummary(input.summary);
    }
    if (input.content) {
      this.validateContent(input.content);
    }

    // Save current version to history
    await this.storage.saveVersion({ ...document });

    // Calculate new version
    const previousVersion = document.version;
    const newVersion = incrementVersion(document.version, input.changeType);

    // Update document
    const now = new Date();
    const contentHash = input.content
      ? this.hashContent(input.content)
      : document.contentHash;

    const updatedDocument: Document = {
      ...document,
      title: input.title || document.title,
      summary: input.summary || document.summary,
      content: input.content || document.content,
      version: newVersion,
      modifiedAt: now,
      modifiedBy: input.modifiedBy,
      contentHash,
      contentSize: input.content?.length || document.contentSize,
      tags: input.tags || document.tags,
      categories: input.categories || document.categories,
      provenance: {
        ...document.provenance,
        version: newVersion,
        modifiedAt: now,
        modifiedBy: input.modifiedBy,
        contentHash,
        contentSize: input.content?.length || document.contentSize,
      },
    };

    // Save updated document
    await this.storage.save(updatedDocument);

    // Emit event
    this.emit('document:updated', { document: updatedDocument, previousVersion });

    return updatedDocument;
  }

  /**
   * Change document state.
   */
  async changeState(
    id: string,
    newState: DocumentState,
    actor: string,
    reason?: string
  ): Promise<Document> {
    const document = await this.get(id);
    const currentState = document.state;

    // Validate transition
    const validTransitions = DOCUMENT_STATE_TRANSITIONS[currentState];
    if (!validTransitions.includes(newState)) {
      throw new InvalidStateTransitionError(id, currentState, newState);
    }

    // Update state
    const now = new Date();
    const updatedDocument: Document = {
      ...document,
      state: newState,
      modifiedAt: now,
      modifiedBy: actor,
      provenance: {
        ...document.provenance,
        modifiedAt: now,
        modifiedBy: actor,
      },
    };

    // Update approval status based on new state
    if (newState === 'approved') {
      updatedDocument.provenance.approvalStatus = 'REVIEWED_APPROVED';
    } else if (newState === 'rejected') {
      updatedDocument.provenance.approvalStatus = 'REVIEWED_REJECTED';
    } else if (newState === 'published') {
      updatedDocument.provenance.approvalStatus =
        document.provenance.reviewHistory.length > 0
          ? 'REVIEWED_APPROVED'
          : 'UNREVIEWED_AUTO_APPROVED';
    }

    // Save updated document
    await this.storage.save(updatedDocument);

    // Emit event
    this.emit('document:state_changed', {
      document: updatedDocument,
      previousState: currentState,
      reason,
    });

    return updatedDocument;
  }

  /**
   * Delete a document (soft delete - archives it).
   */
  async delete(id: string, actor: string): Promise<void> {
    await this.get(id); // Verify document exists

    // Archive instead of delete
    await this.changeState(id, 'archived', actor, 'Deleted by user');

    // Emit event
    this.emit('document:deleted', { documentId: id, actor });
  }

  /**
   * Query documents.
   */
  async query(query: DocumentQuery): Promise<DocumentQueryResult> {
    return this.storage.query(query);
  }

  /**
   * Get version history for a document.
   */
  async getVersionHistory(id: string): Promise<Document[]> {
    await this.get(id); // Verify document exists
    return this.storage.getVersionHistory(id);
  }

  /**
   * Publish a document.
   */
  async publish(id: string, actor: string): Promise<Document> {
    const document = await this.get(id);

    // Must be in approved state to publish
    if (document.state !== 'approved') {
      throw new DocumentValidationError(
        'state',
        `Document must be approved before publishing (current: ${document.state})`
      );
    }

    return this.changeState(id, 'published', actor, 'Published');
  }

  /**
   * Archive a document.
   */
  async archive(id: string, actor: string, reason?: string): Promise<Document> {
    return this.changeState(id, 'archived', actor, reason || 'Archived');
  }

  /**
   * Supersede a document with a new version.
   */
  async supersede(
    id: string,
    newDocumentId: string,
    actor: string
  ): Promise<Document> {
    await this.get(id); // Verify document exists

    // Mark as superseded
    const updatedDocument = await this.changeState(
      id,
      'superseded',
      actor,
      `Superseded by ${newDocumentId}`
    );

    // Update the new document to reference this as parent
    const newDocument = await this.get(newDocumentId);
    if (!newDocument.parentDocuments.includes(id)) {
      await this.update(newDocumentId, {
        modifiedBy: actor,
        changeType: 'patch',
        changeDescription: `Added parent reference to ${id}`,
      });
    }

    return updatedDocument;
  }

  /**
   * Add agent contribution to a document.
   */
  async addAgentContribution(
    id: string,
    contribution: AgentContribution
  ): Promise<Document> {
    const document = await this.get(id);

    const updatedDocument: Document = {
      ...document,
      provenance: {
        ...document.provenance,
        agentContributions: [
          ...document.provenance.agentContributions,
          contribution,
        ],
      },
    };

    await this.storage.save(updatedDocument);
    return updatedDocument;
  }

  /**
   * Link a translation to a document.
   */
  async linkTranslation(
    id: string,
    translationId: string,
    actor: string
  ): Promise<Document> {
    const document = await this.get(id);

    const updatedDocument: Document = {
      ...document,
      hasTranslation: true,
      translationId,
      modifiedAt: new Date(),
      modifiedBy: actor,
    };

    await this.storage.save(updatedDocument);

    // Emit event
    this.emit('document:translation_linked', {
      documentId: id,
      translationId,
    });

    return updatedDocument;
  }

  /**
   * Get documents by issue ID.
   */
  async getByIssueId(issueId: string): Promise<Document[]> {
    const result = await this.query({ issueId, limit: 100 });
    return result.documents;
  }

  /**
   * Get child documents.
   */
  async getChildren(id: string): Promise<Document[]> {
    const result = await this.query({ parentDocumentId: id, limit: 100 });
    return result.documents;
  }

  /**
   * Subscribe to document events.
   */
  subscribe(listener: DocumentEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Validate create input.
   */
  private validateCreateInput(input: CreateDocumentInput): void {
    this.validateTitle(input.title);
    if (this.config.requireSummary || input.summary) {
      this.validateSummary(input.summary);
    }
    this.validateContent(input.content);
  }

  /**
   * Validate title.
   */
  private validateTitle(title: string): void {
    if (title.length < this.config.minTitleLength) {
      throw new DocumentValidationError(
        'title',
        `Must be at least ${this.config.minTitleLength} characters`
      );
    }
    if (title.length > this.config.maxTitleLength) {
      throw new DocumentValidationError(
        'title',
        `Must be at most ${this.config.maxTitleLength} characters`
      );
    }
  }

  /**
   * Validate summary.
   */
  private validateSummary(summary: string): void {
    if (summary.length < this.config.minSummaryLength) {
      throw new DocumentValidationError(
        'summary',
        `Must be at least ${this.config.minSummaryLength} characters`
      );
    }
    if (summary.length > this.config.maxSummaryLength) {
      throw new DocumentValidationError(
        'summary',
        `Must be at most ${this.config.maxSummaryLength} characters`
      );
    }
  }

  /**
   * Validate content.
   */
  private validateContent(content: string): void {
    if (content.length === 0) {
      throw new DocumentValidationError('content', 'Content cannot be empty');
    }
    if (content.length > this.config.maxDocumentSize) {
      throw new DocumentValidationError(
        'content',
        `Must be at most ${this.config.maxDocumentSize} bytes`
      );
    }
  }

  /**
   * Hash content for integrity.
   */
  private hashContent(content: string): string {
    // Simple hash for demo - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }

  /**
   * Emit an event.
   */
  private emit(event: string, data: Record<string, unknown>): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in document event listener:', error);
      }
    }
  }
}

// ===========================================
// Document Provenance for Algora v2.0
// ===========================================

import type {
  Document,
  DocumentProvenance,
  DocumentVersion,
  AgentContribution,
  ReviewRecord,
  ApprovalStatus,
} from './types.js';
import { formatVersion } from './types.js';

/**
 * Provenance verification result.
 */
export interface ProvenanceVerification {
  valid: boolean;
  issues: ProvenanceIssue[];
  verified: ProvenanceCheck[];
}

/**
 * Provenance issue found during verification.
 */
export interface ProvenanceIssue {
  severity: 'error' | 'warning' | 'info';
  field: string;
  message: string;
}

/**
 * Provenance check that was performed.
 */
export interface ProvenanceCheck {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * Provenance chain link.
 */
export interface ProvenanceChainLink {
  documentId: string;
  version: DocumentVersion;
  type: 'parent' | 'child' | 'source' | 'derived';
  relationship: string;
}

/**
 * Full provenance chain for a document.
 */
export interface ProvenanceChain {
  documentId: string;
  rootSignals: string[];
  parentDocuments: ProvenanceChainLink[];
  childDocuments: ProvenanceChainLink[];
  agentContributions: AgentContribution[];
  reviewChain: ReviewRecord[];
  totalCost: number;
  totalTokens: number;
}

/**
 * Storage for provenance data.
 */
export interface ProvenanceStorage {
  save(provenance: DocumentProvenance): Promise<void>;
  get(documentId: string): Promise<DocumentProvenance | null>;
  getBySignal(signalId: string): Promise<DocumentProvenance[]>;
  getByParent(parentDocumentId: string): Promise<DocumentProvenance[]>;
  getByAgent(agentId: string): Promise<DocumentProvenance[]>;
}

/**
 * In-memory provenance storage implementation.
 */
export class InMemoryProvenanceStorage implements ProvenanceStorage {
  private provenances: Map<string, DocumentProvenance> = new Map();
  private signalIndex: Map<string, string[]> = new Map();
  private parentIndex: Map<string, string[]> = new Map();
  private agentIndex: Map<string, string[]> = new Map();

  async save(provenance: DocumentProvenance): Promise<void> {
    this.provenances.set(provenance.documentId, provenance);

    // Update signal index
    for (const signalId of provenance.sourceSignals) {
      const docs = this.signalIndex.get(signalId) || [];
      if (!docs.includes(provenance.documentId)) {
        docs.push(provenance.documentId);
        this.signalIndex.set(signalId, docs);
      }
    }

    // Update parent index
    for (const parentId of provenance.parentDocuments) {
      const docs = this.parentIndex.get(parentId) || [];
      if (!docs.includes(provenance.documentId)) {
        docs.push(provenance.documentId);
        this.parentIndex.set(parentId, docs);
      }
    }

    // Update agent index
    for (const contribution of provenance.agentContributions) {
      const docs = this.agentIndex.get(contribution.agentId) || [];
      if (!docs.includes(provenance.documentId)) {
        docs.push(provenance.documentId);
        this.agentIndex.set(contribution.agentId, docs);
      }
    }
  }

  async get(documentId: string): Promise<DocumentProvenance | null> {
    return this.provenances.get(documentId) || null;
  }

  async getBySignal(signalId: string): Promise<DocumentProvenance[]> {
    const docIds = this.signalIndex.get(signalId) || [];
    return docIds
      .map((id) => this.provenances.get(id))
      .filter((p): p is DocumentProvenance => p !== undefined);
  }

  async getByParent(parentDocumentId: string): Promise<DocumentProvenance[]> {
    const docIds = this.parentIndex.get(parentDocumentId) || [];
    return docIds
      .map((id) => this.provenances.get(id))
      .filter((p): p is DocumentProvenance => p !== undefined);
  }

  async getByAgent(agentId: string): Promise<DocumentProvenance[]> {
    const docIds = this.agentIndex.get(agentId) || [];
    return docIds
      .map((id) => this.provenances.get(id))
      .filter((p): p is DocumentProvenance => p !== undefined);
  }
}

/**
 * Provenance Manager for tracking document origin and changes.
 */
export class ProvenanceManager {
  private storage: ProvenanceStorage;

  constructor(storage?: ProvenanceStorage) {
    this.storage = storage || new InMemoryProvenanceStorage();
  }

  /**
   * Create initial provenance for a new document.
   */
  createInitialProvenance(
    document: Document,
    createdBy: string,
    options?: {
      sourceSignals?: string[];
      parentDocuments?: string[];
      issueId?: string;
      workflowType?: string;
      agentContributions?: AgentContribution[];
    }
  ): DocumentProvenance {
    const now = new Date();

    return {
      documentId: document.id,
      documentType: document.type,
      version: document.version,
      createdAt: now,
      createdBy,
      modifiedAt: now,
      modifiedBy: createdBy,
      sourceSignals: options?.sourceSignals || [],
      parentDocuments: options?.parentDocuments || [],
      issueId: options?.issueId,
      workflowType: options?.workflowType,
      contentHash: this.hashContent(document.content),
      contentSize: document.content.length,
      agentContributions: options?.agentContributions || [],
      reviewHistory: [],
      approvalStatus: 'DRAFT',
    };
  }

  /**
   * Save provenance data.
   */
  async save(provenance: DocumentProvenance): Promise<void> {
    await this.storage.save(provenance);
  }

  /**
   * Get provenance for a document.
   */
  async get(documentId: string): Promise<DocumentProvenance | null> {
    return this.storage.get(documentId);
  }

  /**
   * Add a review to the provenance.
   */
  async addReview(
    documentId: string,
    review: ReviewRecord
  ): Promise<DocumentProvenance | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const updated: DocumentProvenance = {
      ...provenance,
      reviewHistory: [...provenance.reviewHistory, review],
      modifiedAt: new Date(),
      modifiedBy: review.reviewerId,
    };

    // Update approval status based on review action
    if (review.action === 'approve') {
      updated.approvalStatus = 'REVIEWED_APPROVED';
    } else if (review.action === 'reject') {
      updated.approvalStatus = 'REVIEWED_REJECTED';
    } else if (review.action === 'escalate') {
      updated.approvalStatus = 'LOCKED_PENDING_APPROVAL';
    }

    await this.save(updated);
    return updated;
  }

  /**
   * Add an agent contribution to the provenance.
   */
  async addAgentContribution(
    documentId: string,
    contribution: AgentContribution
  ): Promise<DocumentProvenance | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const updated: DocumentProvenance = {
      ...provenance,
      agentContributions: [...provenance.agentContributions, contribution],
      modifiedAt: new Date(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Update approval status.
   */
  async updateApprovalStatus(
    documentId: string,
    status: ApprovalStatus,
    modifiedBy: string
  ): Promise<DocumentProvenance | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const updated: DocumentProvenance = {
      ...provenance,
      approvalStatus: status,
      modifiedAt: new Date(),
      modifiedBy,
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Add source signals to provenance.
   */
  async addSourceSignals(
    documentId: string,
    signalIds: string[]
  ): Promise<DocumentProvenance | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const uniqueSignals = [
      ...new Set([...provenance.sourceSignals, ...signalIds]),
    ];

    const updated: DocumentProvenance = {
      ...provenance,
      sourceSignals: uniqueSignals,
      modifiedAt: new Date(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Add parent documents to provenance.
   */
  async addParentDocuments(
    documentId: string,
    parentIds: string[]
  ): Promise<DocumentProvenance | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const uniqueParents = [
      ...new Set([...provenance.parentDocuments, ...parentIds]),
    ];

    const updated: DocumentProvenance = {
      ...provenance,
      parentDocuments: uniqueParents,
      modifiedAt: new Date(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Verify provenance integrity.
   */
  async verify(
    document: Document,
    provenance: DocumentProvenance
  ): Promise<ProvenanceVerification> {
    const issues: ProvenanceIssue[] = [];
    const verified: ProvenanceCheck[] = [];

    // Check document ID match
    const idCheck = provenance.documentId === document.id;
    verified.push({
      name: 'document_id_match',
      passed: idCheck,
      details: idCheck ? undefined : 'Document ID mismatch',
    });
    if (!idCheck) {
      issues.push({
        severity: 'error',
        field: 'documentId',
        message: 'Provenance document ID does not match document',
      });
    }

    // Check content hash
    const expectedHash = this.hashContent(document.content);
    const hashCheck = provenance.contentHash === expectedHash;
    verified.push({
      name: 'content_hash',
      passed: hashCheck,
      details: hashCheck ? undefined : 'Content hash mismatch',
    });
    if (!hashCheck) {
      issues.push({
        severity: 'error',
        field: 'contentHash',
        message: 'Content has been modified since provenance was created',
      });
    }

    // Check content size
    const sizeCheck = provenance.contentSize === document.content.length;
    verified.push({
      name: 'content_size',
      passed: sizeCheck,
      details: sizeCheck ? undefined : 'Content size mismatch',
    });
    if (!sizeCheck) {
      issues.push({
        severity: 'warning',
        field: 'contentSize',
        message: 'Content size does not match',
      });
    }

    // Check version match
    const versionCheck =
      formatVersion(provenance.version) === formatVersion(document.version);
    verified.push({
      name: 'version_match',
      passed: versionCheck,
      details: versionCheck ? undefined : 'Version mismatch',
    });
    if (!versionCheck) {
      issues.push({
        severity: 'warning',
        field: 'version',
        message: 'Provenance version does not match document version',
      });
    }

    // Check timestamps
    const timestampCheck = provenance.createdAt <= provenance.modifiedAt;
    verified.push({
      name: 'timestamp_order',
      passed: timestampCheck,
      details: timestampCheck ? undefined : 'Timestamps out of order',
    });
    if (!timestampCheck) {
      issues.push({
        severity: 'error',
        field: 'timestamps',
        message: 'Created timestamp is after modified timestamp',
      });
    }

    // Check review chain integrity
    let reviewChainValid = true;
    for (let i = 1; i < provenance.reviewHistory.length; i++) {
      const prev = provenance.reviewHistory[i - 1];
      const curr = provenance.reviewHistory[i];
      if (curr.timestamp < prev.timestamp) {
        reviewChainValid = false;
        break;
      }
    }
    verified.push({
      name: 'review_chain_order',
      passed: reviewChainValid,
      details: reviewChainValid ? undefined : 'Reviews out of order',
    });
    if (!reviewChainValid) {
      issues.push({
        severity: 'error',
        field: 'reviewHistory',
        message: 'Review chain timestamps are not in order',
      });
    }

    // Check agent contributions have required fields
    const contributionsValid = provenance.agentContributions.every(
      (c) => c.agentId && c.role && c.modelUsed && c.outputHash
    );
    verified.push({
      name: 'contributions_complete',
      passed: contributionsValid,
      details: contributionsValid
        ? undefined
        : 'Missing fields in contributions',
    });
    if (!contributionsValid) {
      issues.push({
        severity: 'warning',
        field: 'agentContributions',
        message: 'Some agent contributions are missing required fields',
      });
    }

    return {
      valid: issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      verified,
    };
  }

  /**
   * Build the full provenance chain for a document.
   */
  async buildChain(documentId: string): Promise<ProvenanceChain | null> {
    const provenance = await this.get(documentId);
    if (!provenance) return null;

    const parentDocuments: ProvenanceChainLink[] = [];
    const childDocuments: ProvenanceChainLink[] = [];

    // Get parent documents
    for (const parentId of provenance.parentDocuments) {
      const parentProvenance = await this.get(parentId);
      if (parentProvenance) {
        parentDocuments.push({
          documentId: parentId,
          version: parentProvenance.version,
          type: 'parent',
          relationship: 'derived_from',
        });
      }
    }

    // Get child documents
    const children = await this.storage.getByParent(documentId);
    for (const child of children) {
      childDocuments.push({
        documentId: child.documentId,
        version: child.version,
        type: 'child',
        relationship: 'derived_to',
      });
    }

    // Calculate totals
    const totalCost = provenance.agentContributions.reduce(
      (sum, c) => sum + c.costUsd,
      0
    );
    const totalTokens = provenance.agentContributions.reduce(
      (sum, c) => sum + c.tokenCount,
      0
    );

    return {
      documentId,
      rootSignals: provenance.sourceSignals,
      parentDocuments,
      childDocuments,
      agentContributions: provenance.agentContributions,
      reviewChain: provenance.reviewHistory,
      totalCost,
      totalTokens,
    };
  }

  /**
   * Get documents by source signal.
   */
  async getBySignal(signalId: string): Promise<DocumentProvenance[]> {
    return this.storage.getBySignal(signalId);
  }

  /**
   * Get documents by agent.
   */
  async getByAgent(agentId: string): Promise<DocumentProvenance[]> {
    return this.storage.getByAgent(agentId);
  }

  /**
   * Generate "Unreviewed by Human" label.
   */
  generateUnreviewedLabel(provenance: DocumentProvenance): string {
    if (provenance.approvalStatus === 'UNREVIEWED_AUTO_APPROVED') {
      return `[UNREVIEWED BY HUMAN] This document was auto-approved via Passive Consensus.
Review history: ${provenance.reviewHistory.length === 0 ? 'None' : provenance.reviewHistory.length + ' reviews'}`;
    }
    return '';
  }

  /**
   * Check if document requires human review based on approval status.
   */
  requiresHumanReview(provenance: DocumentProvenance): boolean {
    return (
      provenance.approvalStatus === 'LOCKED_PENDING_APPROVAL' ||
      provenance.approvalStatus === 'PENDING_REVIEW'
    );
  }

  /**
   * Get review summary for a document.
   */
  getReviewSummary(provenance: DocumentProvenance): {
    totalReviews: number;
    approvals: number;
    rejections: number;
    changesRequested: number;
    escalations: number;
    humanReviews: number;
    agentReviews: number;
  } {
    const reviews = provenance.reviewHistory;

    return {
      totalReviews: reviews.length,
      approvals: reviews.filter((r) => r.action === 'approve').length,
      rejections: reviews.filter((r) => r.action === 'reject').length,
      changesRequested: reviews.filter((r) => r.action === 'request_changes')
        .length,
      escalations: reviews.filter((r) => r.action === 'escalate').length,
      humanReviews: reviews.filter((r) => r.reviewerType === 'human').length,
      agentReviews: reviews.filter((r) => r.reviewerType === 'agent').length,
    };
  }

  /**
   * Hash content for integrity checking.
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
}

/**
 * Create a content integrity proof.
 */
export function createIntegrityProof(
  content: string,
  signedBy?: string
): DocumentProvenance['integrityProof'] {
  // Simple hash for demo - in production use crypto
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return {
    algorithm: 'sha256',
    hash: `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`,
    signedBy,
    signatureTimestamp: signedBy ? new Date() : undefined,
  };
}

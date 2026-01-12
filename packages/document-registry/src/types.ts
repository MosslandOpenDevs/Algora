// ===========================================
// Document Registry Types for Algora v2.0
// ===========================================

// ============================================
// Document Types
// ============================================

/**
 * Official document type codes.
 */
export type DocumentType =
  // Decision Documents
  | 'DP'   // Decision Packet
  | 'GP'   // Governance Proposal
  | 'RM'   // Resolution Memo
  | 'RC'   // Reconciliation Memo
  // Working Group Documents
  | 'WGC'  // Working Group Charter
  | 'WGR'  // Working Group Report
  // Ecosystem Documents
  | 'ER'   // Ecosystem Report
  | 'PP'   // Partnership Proposal
  | 'PA'   // Partnership Agreement
  // Developer Program Documents
  | 'DGP'  // Developer Grant Proposal
  | 'DG'   // Developer Grant
  | 'MR'   // Milestone Report
  | 'RR'   // Retroactive Reward
  // Transparency Documents
  | 'DR'   // Disclosure Report
  | 'AR';  // Audit Report

/**
 * Document type descriptions.
 */
export const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  DP: 'Decision Packet',
  GP: 'Governance Proposal',
  RM: 'Resolution Memo',
  RC: 'Reconciliation Memo',
  WGC: 'Working Group Charter',
  WGR: 'Working Group Report',
  ER: 'Ecosystem Report',
  PP: 'Partnership Proposal',
  PA: 'Partnership Agreement',
  DGP: 'Developer Grant Proposal',
  DG: 'Developer Grant',
  MR: 'Milestone Report',
  RR: 'Retroactive Reward',
  DR: 'Disclosure Report',
  AR: 'Audit Report',
};

/**
 * Document categories for grouping.
 */
export type DocumentCategory =
  | 'decision'
  | 'working_group'
  | 'ecosystem'
  | 'developer'
  | 'transparency';

/**
 * Map document types to categories.
 */
export const DOCUMENT_CATEGORY_MAP: Record<DocumentType, DocumentCategory> = {
  DP: 'decision',
  GP: 'decision',
  RM: 'decision',
  RC: 'decision',
  WGC: 'working_group',
  WGR: 'working_group',
  ER: 'ecosystem',
  PP: 'ecosystem',
  PA: 'ecosystem',
  DGP: 'developer',
  DG: 'developer',
  MR: 'developer',
  RR: 'developer',
  DR: 'transparency',
  AR: 'transparency',
};

// ============================================
// Document State
// ============================================

/**
 * Document lifecycle states.
 */
export type DocumentState =
  | 'draft'
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'superseded'
  | 'archived'
  | 'rejected';

/**
 * Valid state transitions.
 */
export const DOCUMENT_STATE_TRANSITIONS: Record<DocumentState, DocumentState[]> = {
  draft: ['pending_review'],
  pending_review: ['in_review', 'draft'],
  in_review: ['approved', 'rejected', 'draft'],
  approved: ['published'],
  published: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
  rejected: ['draft', 'archived'],
};

// ============================================
// Version Types
// ============================================

/**
 * Semantic version for documents.
 */
export interface DocumentVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Version change type.
 */
export type VersionChangeType = 'major' | 'minor' | 'patch';

/**
 * Version metadata.
 */
export interface VersionMetadata {
  version: DocumentVersion;
  createdAt: Date;
  createdBy: string;
  changeType: VersionChangeType;
  changeDescription: string;
  previousVersionId?: string;
}

// ============================================
// Provenance Types
// ============================================

/**
 * Approval status for documents.
 */
export type ApprovalStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVIEWED_APPROVED'
  | 'REVIEWED_REJECTED'
  | 'UNREVIEWED_AUTO_APPROVED'
  | 'LOCKED_PENDING_APPROVAL';

/**
 * Review record for tracking reviews.
 */
export interface ReviewRecord {
  reviewerId: string;
  reviewerType: 'human' | 'agent';
  action: 'approve' | 'reject' | 'request_changes' | 'escalate';
  timestamp: Date;
  comments?: string;
  signature?: string;
}

/**
 * Agent contribution to a document.
 */
export interface AgentContribution {
  agentId: string;
  role: string;
  modelUsed: string;
  tokenCount: number;
  costUsd: number;
  outputHash: string;
  timestamp: Date;
}

/**
 * Full provenance information for a document.
 */
export interface DocumentProvenance {
  documentId: string;
  documentType: DocumentType;
  version: DocumentVersion;
  createdAt: Date;
  createdBy: string;
  modifiedAt: Date;
  modifiedBy: string;

  // Source tracking
  sourceSignals: string[];
  parentDocuments: string[];
  issueId?: string;
  workflowType?: string;

  // Content integrity
  contentHash: string;
  contentSize: number;

  // Agent contributions
  agentContributions: AgentContribution[];

  // Review chain
  reviewHistory: ReviewRecord[];
  approvalStatus: ApprovalStatus;

  // Integrity proof
  integrityProof?: {
    algorithm: 'sha256';
    hash: string;
    signedBy?: string;
    signatureTimestamp?: Date;
  };
}

// ============================================
// Audit Types
// ============================================

/**
 * Audit action types.
 */
export type AuditAction =
  | 'created'
  | 'updated'
  | 'state_changed'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'accessed'
  | 'exported'
  | 'deleted'
  | 'restored';

/**
 * Actor type for audit entries.
 */
export interface AuditActor {
  id: string;
  type: 'agent' | 'human' | 'system';
  name?: string;
}

/**
 * Audit entry for tracking document changes.
 */
export interface AuditEntry {
  id: string;
  documentId: string;
  action: AuditAction;
  actor: AuditActor;
  timestamp: Date;
  previousState?: DocumentState;
  newState?: DocumentState;
  contentHashBefore?: string;
  contentHashAfter?: string;
  metadata: Record<string, unknown>;
}

// ============================================
// Document Types
// ============================================

/**
 * Document metadata.
 */
export interface DocumentMetadata {
  id: string;
  type: DocumentType;
  title: string;
  summary: string;
  version: DocumentVersion;
  state: DocumentState;

  // Provenance
  createdAt: Date;
  createdBy: string;
  modifiedAt: Date;
  modifiedBy: string;

  // Relationships
  issueId?: string;
  parentDocuments: string[];
  childDocuments: string[];
  relatedWorkflow?: string;

  // Content
  contentHash: string;
  contentSize: number;
  language: 'en' | 'ko';
  hasTranslation: boolean;
  translationId?: string;

  // Access
  accessLevel: 'public' | 'governance' | 'internal';
  reviewRequired: boolean;
  approvedBy?: string[];

  // Indexing
  tags: string[];
  categories: string[];
  mentionedAgents: string[];
  mentionedProposals: string[];
}

/**
 * Full document with content.
 */
export interface Document extends DocumentMetadata {
  content: string;
  provenance: DocumentProvenance;
}

/**
 * Document creation input.
 */
export interface CreateDocumentInput {
  type: DocumentType;
  title: string;
  summary: string;
  content: string;
  language?: 'en' | 'ko';
  issueId?: string;
  parentDocuments?: string[];
  tags?: string[];
  categories?: string[];
  accessLevel?: 'public' | 'governance' | 'internal';
  createdBy: string;
  agentContributions?: AgentContribution[];
}

/**
 * Document update input.
 */
export interface UpdateDocumentInput {
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  categories?: string[];
  modifiedBy: string;
  changeType: VersionChangeType;
  changeDescription: string;
}

// ============================================
// Query Types
// ============================================

/**
 * Document query filters.
 */
export interface DocumentQuery {
  type?: DocumentType | DocumentType[];
  state?: DocumentState | DocumentState[];
  category?: DocumentCategory;
  language?: 'en' | 'ko';
  accessLevel?: 'public' | 'governance' | 'internal';
  createdBy?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  tags?: string[];
  search?: string;
  issueId?: string;
  parentDocumentId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'modifiedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Query result with pagination.
 */
export interface DocumentQueryResult {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ============================================
// Event Types
// ============================================

/**
 * Events emitted by the document registry.
 */
export interface DocumentRegistryEvents {
  'document:created': { document: Document };
  'document:updated': { document: Document; previousVersion: DocumentVersion };
  'document:state_changed': { document: Document; previousState: DocumentState };
  'document:reviewed': { document: Document; review: ReviewRecord };
  'document:published': { document: Document };
  'document:archived': { document: Document };
  'document:deleted': { documentId: string };
}

// ============================================
// Configuration Types
// ============================================

/**
 * Configuration for the document registry.
 */
export interface DocumentRegistryConfig {
  // Storage
  maxDocumentSize: number;
  maxVersionsPerDocument: number;

  // Validation
  requireSummary: boolean;
  minTitleLength: number;
  maxTitleLength: number;
  minSummaryLength: number;
  maxSummaryLength: number;

  // Retention
  archiveAfterDays: number;
  deleteAfterDays: number;

  // Audit
  auditRetentionDays: number;
  logAccess: boolean;
}

/**
 * Default document registry configuration.
 */
export const DEFAULT_DOCUMENT_REGISTRY_CONFIG: DocumentRegistryConfig = {
  maxDocumentSize: 1024 * 1024, // 1MB
  maxVersionsPerDocument: 100,
  requireSummary: true,
  minTitleLength: 10,
  maxTitleLength: 200,
  minSummaryLength: 50,
  maxSummaryLength: 500,
  archiveAfterDays: 365,
  deleteAfterDays: 730,
  auditRetentionDays: 365 * 5,
  logAccess: true,
};

// ============================================
// ID Generation
// ============================================

/**
 * Generate a document ID.
 * Format: DOC-{type}-{YYYYMMDD}-{seq}
 */
export function generateDocumentId(type: DocumentType, date: Date, sequence: number): string {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seqStr = sequence.toString().padStart(4, '0');
  return `DOC-${type}-${dateStr}-${seqStr}`;
}

/**
 * Parse a document ID.
 */
export function parseDocumentId(id: string): {
  type: DocumentType;
  date: string;
  sequence: number;
} | null {
  const match = id.match(/^DOC-([A-Z]+)-(\d{8})-(\d{4})$/);
  if (!match) return null;

  return {
    type: match[1] as DocumentType,
    date: match[2],
    sequence: parseInt(match[3], 10),
  };
}

/**
 * Format version as string.
 */
export function formatVersion(version: DocumentVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Parse version string.
 */
export function parseVersion(versionStr: string): DocumentVersion | null {
  const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Increment version based on change type.
 */
export function incrementVersion(
  version: DocumentVersion,
  changeType: VersionChangeType
): DocumentVersion {
  switch (changeType) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0 };
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0 };
    case 'patch':
      return { major: version.major, minor: version.minor, patch: version.patch + 1 };
  }
}

/**
 * Compare two versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: DocumentVersion, b: DocumentVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

// ===========================================
// Document Registry Package for Algora v2.0
// ===========================================

/**
 * @packageDocumentation
 *
 * The Document Registry package provides official document storage,
 * versioning, provenance tracking, and audit trail capabilities
 * for Algora v2.0's governance system.
 *
 * ## Core Components
 *
 * - **DocumentManager**: CRUD operations for documents
 * - **VersionManager**: Document versioning and history
 * - **ProvenanceManager**: Origin and change tracking
 * - **AuditManager**: Immutable audit trail
 *
 * ## Example Usage
 *
 * ```typescript
 * import {
 *   DocumentManager,
 *   VersionManager,
 *   ProvenanceManager,
 *   AuditManager,
 * } from '@algora/document-registry';
 *
 * // Create managers
 * const documents = new DocumentManager();
 * const versions = new VersionManager();
 * const provenance = new ProvenanceManager();
 * const audit = new AuditManager();
 *
 * // Create a document
 * const doc = await documents.create({
 *   type: 'DP',
 *   title: 'Decision Packet: New Feature',
 *   summary: 'Analysis and recommendation for implementing...',
 *   content: '# Decision Packet\n\n...',
 *   createdBy: 'orchestrator-001',
 * });
 *
 * // Log the creation
 * await audit.logCreated(doc.id, { id: 'orchestrator-001', type: 'agent' }, doc.contentHash);
 * ```
 *
 * ## Document Types
 *
 * Supported official document types:
 * - **DP**: Decision Packet
 * - **GP**: Governance Proposal
 * - **RM**: Resolution Memo
 * - **RC**: Reconciliation Memo
 * - **WGC**: Working Group Charter
 * - **WGR**: Working Group Report
 * - **ER**: Ecosystem Report
 * - **PP**: Partnership Proposal
 * - **PA**: Partnership Agreement
 * - **DGP**: Developer Grant Proposal
 * - **DG**: Developer Grant
 * - **MR**: Milestone Report
 * - **RR**: Retroactive Reward
 * - **DR**: Disclosure Report
 * - **AR**: Audit Report
 */

// ============================================
// Types
// ============================================

export type {
  // Document types
  DocumentType,
  DocumentCategory,
  DocumentState,
  Document,
  DocumentMetadata,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentQuery,
  DocumentQueryResult,

  // Version types
  DocumentVersion,
  VersionChangeType,
  VersionMetadata,

  // Provenance types
  ApprovalStatus,
  ReviewRecord,
  AgentContribution,
  DocumentProvenance,

  // Audit types
  AuditAction,
  AuditActor,
  AuditEntry,

  // Event types
  DocumentRegistryEvents,

  // Config types
  DocumentRegistryConfig,
} from './types.js';

export {
  // Constants
  DOCUMENT_TYPE_DESCRIPTIONS,
  DOCUMENT_CATEGORY_MAP,
  DOCUMENT_STATE_TRANSITIONS,
  DEFAULT_DOCUMENT_REGISTRY_CONFIG,

  // ID utilities
  generateDocumentId,
  parseDocumentId,

  // Version utilities
  formatVersion,
  parseVersion,
  incrementVersion,
  compareVersions,
} from './types.js';

// ============================================
// Document Manager
// ============================================

export {
  DocumentManager,
  InMemoryDocumentStorage,
  DocumentValidationError,
  InvalidStateTransitionError,
  DocumentNotFoundError,
} from './document.js';

export type {
  DocumentStorage,
  DocumentEventListener,
  DocumentManagerOptions,
} from './document.js';

// ============================================
// Version Manager
// ============================================

export {
  VersionManager,
  InMemoryVersionStorage,
  createVersionTag,
  parseVersionTag,
} from './versioning.js';

export type {
  DocumentDiff,
  DocumentChange,
  VersionBranch,
  VersionStorage,
} from './versioning.js';

// ============================================
// Provenance Manager
// ============================================

export {
  ProvenanceManager,
  InMemoryProvenanceStorage,
  createIntegrityProof,
} from './provenance.js';

export type {
  ProvenanceVerification,
  ProvenanceIssue,
  ProvenanceCheck,
  ProvenanceChainLink,
  ProvenanceChain,
  ProvenanceStorage,
} from './provenance.js';

// ============================================
// Audit Manager
// ============================================

export {
  AuditManager,
  InMemoryAuditStorage,
  createSystemActor,
  createAgentActor,
  createHumanActor,
} from './audit.js';

export type {
  AuditQuery,
  AuditQueryResult,
  AuditSummary,
  AuditStorage,
  AuditManagerOptions,
} from './audit.js';

// ============================================
// Factory Functions
// ============================================

import type { DocumentRegistryConfig } from './types.js';
import { DEFAULT_DOCUMENT_REGISTRY_CONFIG } from './types.js';
import { DocumentManager } from './document.js';
import { VersionManager } from './versioning.js';
import { ProvenanceManager } from './provenance.js';
import { AuditManager } from './audit.js';

/**
 * Create a complete document registry system.
 */
export function createDocumentRegistry(config?: Partial<DocumentRegistryConfig>): {
  documents: DocumentManager;
  versions: VersionManager;
  provenance: ProvenanceManager;
  audit: AuditManager;
} {
  const fullConfig = {
    ...DEFAULT_DOCUMENT_REGISTRY_CONFIG,
    ...config,
  };

  return {
    documents: new DocumentManager({ config: fullConfig }),
    versions: new VersionManager(),
    provenance: new ProvenanceManager(),
    audit: new AuditManager({ config: fullConfig }),
  };
}

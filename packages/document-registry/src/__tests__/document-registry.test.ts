// ===========================================
// Document Registry Package Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentManager,
  InMemoryDocumentStorage,
  VersionManager,
  ProvenanceManager,
  AuditManager,
  InMemoryAuditStorage,
  createDocumentRegistry,
  DOCUMENT_TYPE_DESCRIPTIONS,
  DOCUMENT_STATE_TRANSITIONS,
  DEFAULT_DOCUMENT_REGISTRY_CONFIG,
} from '../index.js';

describe('Document Registry Package', () => {
  describe('DocumentManager', () => {
    let manager: DocumentManager;

    beforeEach(() => {
      manager = new DocumentManager();
    });

    it('should create a document manager', () => {
      expect(manager).toBeDefined();
    });

    it('should create a document', async () => {
      const doc = await manager.create({
        type: 'DECISION_PACKET',
        title: 'Test Decision Packet',
        summary: 'This is a test summary that is long enough to meet the minimum length requirements.',
        content: JSON.stringify({ test: true }),
        createdBy: 'test-user',
      });

      expect(doc).toBeDefined();
      expect(doc.id).toBeDefined();
      expect(doc.type).toBe('DECISION_PACKET');
      expect(doc.state).toBe('draft');
    });

    it('should get a document by id', async () => {
      const created = await manager.create({
        type: 'RESEARCH_DIGEST',
        title: 'Weekly Digest',
        summary: 'This is a test summary that is long enough to meet the minimum length requirements.',
        content: '{}',
        createdBy: 'test-user',
      });

      const retrieved = await manager.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
    });

    it('should change document state', async () => {
      const doc = await manager.create({
        type: 'GOVERNANCE_PROPOSAL',
        title: 'Test Proposal',
        summary: 'This is a test summary that is long enough to meet the minimum length requirements.',
        content: '{}',
        createdBy: 'test-user',
      });

      // draft -> pending_review
      const updated = await manager.changeState(doc.id, 'pending_review', 'test-user', 'Submitting for review');
      expect(updated.state).toBe('pending_review');
    });
  });

  describe('AuditManager', () => {
    let auditManager: AuditManager;

    beforeEach(() => {
      auditManager = new AuditManager(new InMemoryAuditStorage());
    });

    it('should create an audit manager', () => {
      expect(auditManager).toBeDefined();
    });

    it('should log document creation', async () => {
      const entry = await auditManager.logCreated('doc-001', { id: 'user-001', type: 'human' }, 'hash123');

      expect(entry).toBeDefined();
      expect(entry.documentId).toBe('doc-001');
      expect(entry.action).toBe('created');
    });
  });

  describe('ProvenanceManager', () => {
    let provenanceManager: ProvenanceManager;
    let documentManager: DocumentManager;

    beforeEach(() => {
      provenanceManager = new ProvenanceManager();
      documentManager = new DocumentManager();
    });

    it('should create a provenance manager', () => {
      expect(provenanceManager).toBeDefined();
    });

    it('should create initial provenance', async () => {
      // First create a document
      const doc = await documentManager.create({
        type: 'DECISION_PACKET',
        title: 'Test Document for Provenance',
        summary: 'This is a test summary that is long enough to meet the minimum length requirements for validation.',
        content: JSON.stringify({ test: true }),
        createdBy: 'test-agent',
      });

      const provenance = provenanceManager.createInitialProvenance(doc, 'test-agent', {
        issueId: 'issue-001',
        workflowType: 'A',
      });

      expect(provenance).toBeDefined();
      expect(provenance.createdBy).toBe('test-agent');
      expect(provenance.documentId).toBe(doc.id);
    });
  });

  describe('createDocumentRegistry', () => {
    it('should create a complete document registry', () => {
      const registry = createDocumentRegistry();

      expect(registry).toBeDefined();
      expect(registry.documents).toBeDefined();
      expect(registry.versions).toBeDefined();
      expect(registry.provenance).toBeDefined();
      expect(registry.audit).toBeDefined();
    });
  });

  describe('Constants', () => {
    it('should have document type descriptions', () => {
      expect(DOCUMENT_TYPE_DESCRIPTIONS).toBeDefined();
      expect(DOCUMENT_TYPE_DESCRIPTIONS.DP).toBe('Decision Packet');
      expect(DOCUMENT_TYPE_DESCRIPTIONS.GP).toBe('Governance Proposal');
    });

    it('should have state transitions', () => {
      expect(DOCUMENT_STATE_TRANSITIONS).toBeDefined();
      expect(DOCUMENT_STATE_TRANSITIONS.draft).toContain('pending_review');
    });

    it('should have default config', () => {
      expect(DEFAULT_DOCUMENT_REGISTRY_CONFIG).toBeDefined();
      expect(DEFAULT_DOCUMENT_REGISTRY_CONFIG.minSummaryLength).toBe(50);
      expect(DEFAULT_DOCUMENT_REGISTRY_CONFIG.requireSummary).toBe(true);
    });
  });
});

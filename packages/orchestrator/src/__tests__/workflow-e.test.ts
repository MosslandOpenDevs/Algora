// ===========================================
// Workflow E Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowEHandler,
  createWorkflowEHandler,
  DEFAULT_WORKFLOW_E_CONFIG,
  type WorkingGroupProposal,
  type WorkingGroupCharter,
  type WorkingGroup,
  type WGProposalEvaluation,
} from '../workflows/workflow-e.js';
import type { WorkflowContext } from '../types.js';
import type { LLMProvider } from '../specialist-manager.js';

// Mock LLM Provider
function createMockLLMProvider(): LLMProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      content: `Purpose Clarity: 85
Scope Appropriateness: 80
Team Composition: 75
Resource Adequacy: 70
Governance Fit: 80
Overlap: 15

Strengths:
- Clear purpose and mission
- Experienced team members
- Well-defined scope

Concerns:
- Budget may be insufficient
- Timeline is ambitious

Modifications:
- Consider extending charter duration

Recommendation: Approve
This working group addresses a clear need in the governance structure.`,
      model: 'mock-model',
      tokensUsed: 800,
    }),
    isAvailable: vi.fn().mockReturnValue(true),
    getModelInfo: vi.fn().mockReturnValue({
      id: 'mock-model',
      contextWindow: 8000,
      tokensPerSecond: 100,
    }),
  };
}

// Create mock context
function createMockContext(): WorkflowContext {
  return {
    issueId: 'test-issue-005',
    workflowType: 'E',
    currentState: 'RESEARCH',
    issue: {
      id: 'test-issue-005',
      title: 'Form Technical Standards Working Group',
      description: 'Proposal to form a working group for technical standards',
      category: 'community_governance',
      source: 'community',
      signalIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    stateHistory: [],
    agentOpinions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Create mock proposal
function createMockProposal(): Omit<WorkingGroupProposal, 'id' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'Technical Standards WG',
    purpose: 'Establish and maintain technical standards for the Mossland ecosystem',
    scope: ['API standards', 'Data formats', 'Integration guidelines'],
    chairAgent: 'tech-lead-agent',
    memberAgents: ['dev-agent-1', 'dev-agent-2', 'architect-agent'],
    charterDuration: '6m',
    publishingAuthority: ['technology_assessment', 'wg_report', 'status_update'],
    origin: 'community',
    requiredApprovals: {
      mossCoinHouse: true,
      openSourceHouse: true,
      director3: false,
    },
    proposedBy: 'community-member',
    proposedAt: new Date(),
  };
}

// Create mock approved proposal
function createMockApprovedProposal(): WorkingGroupProposal {
  return {
    ...createMockProposal(),
    id: 'WGP-001',
    status: 'approved',
    approvalStatus: {
      mossCoinHouse: true,
      openSourceHouse: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('WorkflowEHandler', () => {
  let handler: WorkflowEHandler;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = createMockLLMProvider();
    handler = new WorkflowEHandler(mockProvider);
  });

  describe('createWorkflowEHandler', () => {
    it('should create a handler with default config', () => {
      const h = createWorkflowEHandler(mockProvider);
      expect(h).toBeInstanceOf(WorkflowEHandler);
    });

    it('should create a handler with custom config', () => {
      const h = createWorkflowEHandler(mockProvider, {
        defaultChairTermMonths: 12,
        maxMembersPerWG: 15,
      });
      expect(h).toBeInstanceOf(WorkflowEHandler);
    });
  });

  describe('DEFAULT_WORKFLOW_E_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_WORKFLOW_E_CONFIG.defaultChairTermMonths).toBe(6);
      expect(DEFAULT_WORKFLOW_E_CONFIG.maxMembersPerWG).toBe(10);
      expect(DEFAULT_WORKFLOW_E_CONFIG.minMembersPerWG).toBe(3);
      expect(DEFAULT_WORKFLOW_E_CONFIG.defaultPublishingCooldown).toBe('24h');
      expect(DEFAULT_WORKFLOW_E_CONFIG.defaultMaxDocsPerWeek).toBe(5);
      expect(DEFAULT_WORKFLOW_E_CONFIG.autoProposalEnabled).toBe(true);
      expect(DEFAULT_WORKFLOW_E_CONFIG.autoProposalThreshold).toBe(5);
    });
  });

  describe('processWGProposal', () => {
    it('should process a WG proposal and return evaluation', async () => {
      const context = createMockContext();
      const proposal = createMockProposal();

      const result = await handler.processWGProposal(context, proposal);

      expect(result).toHaveProperty('proposal');
      expect(result).toHaveProperty('evaluation');
      expect(result).toHaveProperty('opinions');
      expect(result.proposal.id).toMatch(/^WGP-/);
      expect(result.proposal.status).toBe('under_review');
      expect(result.evaluation.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.opinions.length).toBeGreaterThan(0);
    });

    it('should reject proposal with invalid name', async () => {
      const context = createMockContext();
      const proposal = createMockProposal();
      proposal.name = 'WG'; // Too short

      await expect(
        handler.processWGProposal(context, proposal)
      ).rejects.toThrow('name must be at least 3 characters');
    });

    it('should reject proposal with too few members', async () => {
      const context = createMockContext();
      const proposal = createMockProposal();
      proposal.memberAgents = ['agent-1', 'agent-2']; // Less than minimum

      await expect(
        handler.processWGProposal(context, proposal)
      ).rejects.toThrow('at least 3 members');
    });

    it('should reject proposal with too many members', async () => {
      const context = createMockContext();
      const proposal = createMockProposal();
      proposal.memberAgents = Array(12).fill('agent').map((a, i) => `${a}-${i}`);

      await expect(
        handler.processWGProposal(context, proposal)
      ).rejects.toThrow('cannot have more than');
    });
  });

  describe('evaluateProposal', () => {
    it('should evaluate a proposal and return scores', async () => {
      const context = createMockContext();
      const proposal: WorkingGroupProposal = {
        ...createMockProposal(),
        id: 'WGP-TEST-001',
        status: 'submitted',
        approvalStatus: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const evaluation = await handler.evaluateProposal(context, proposal);

      expect(evaluation.proposalId).toBe(proposal.id);
      expect(evaluation.scores).toBeDefined();
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(100);
      expect(evaluation.recommendation).toMatch(/^(approve|reject|modify)$/);
      expect(evaluation.strengths.length).toBeGreaterThan(0);
    });
  });

  describe('createCharter', () => {
    it('should create charter from approved proposal', () => {
      const proposal = createMockApprovedProposal();

      const charter = handler.createCharter(proposal);

      expect(charter.id).toMatch(/^WGC-/);
      expect(charter.proposalId).toBe(proposal.id);
      expect(charter.name).toBe(proposal.name);
      expect(charter.purpose).toBe(proposal.purpose);
      expect(charter.status).toBe('approved');
      expect(charter.publishingAuthority).toEqual(proposal.publishingAuthority);
    });

    it('should throw error for missing approvals', () => {
      const proposal: WorkingGroupProposal = {
        ...createMockProposal(),
        id: 'WGP-002',
        status: 'submitted',
        approvalStatus: {
          mossCoinHouse: true,
          // Missing openSourceHouse
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => handler.createCharter(proposal)).toThrow('Missing required approvals');
    });

    it('should set expiration date for non-indefinite charters', () => {
      const proposal = createMockApprovedProposal();
      proposal.charterDuration = '6m';

      const charter = handler.createCharter(proposal);

      expect(charter.expirationDate).toBeDefined();
      const expectedExpiration = new Date();
      expectedExpiration.setMonth(expectedExpiration.getMonth() + 6);
      // Allow for a few seconds difference
      expect(Math.abs(charter.expirationDate!.getTime() - expectedExpiration.getTime())).toBeLessThan(5000);
    });

    it('should not set expiration date for indefinite charters', () => {
      const proposal = createMockApprovedProposal();
      proposal.charterDuration = 'indefinite';

      const charter = handler.createCharter(proposal);

      expect(charter.expirationDate).toBeUndefined();
    });
  });

  describe('activateWorkingGroup', () => {
    it('should activate WG from approved charter', () => {
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);

      const wg = handler.activateWorkingGroup(charter);

      expect(wg.id).toMatch(/^WG-/);
      expect(wg.charterId).toBe(charter.id);
      expect(wg.name).toBe(charter.name);
      expect(wg.status).toBe('active');
      expect(charter.status).toBe('active');
    });

    it('should throw error for non-approved charter', () => {
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      charter.status = 'suspended';

      expect(() => handler.activateWorkingGroup(charter)).toThrow('must be approved');
    });
  });

  describe('canPublishDocument', () => {
    it('should allow publication of authorized document type', () => {
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      const result = handler.canPublishDocument(wg.id, 'wg_report');

      expect(result.allowed).toBe(true);
    });

    it('should reject non-existent working group', () => {
      const result = handler.canPublishDocument('non-existent', 'wg_report');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should reject unauthorized document type', () => {
      const proposal = createMockApprovedProposal();
      proposal.publishingAuthority = ['wg_report']; // Limited authority
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      const result = handler.canPublishDocument(wg.id, 'grant_proposal');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in publishing authority');
    });
  });

  describe('recordPublication', () => {
    it('should increment publication count', () => {
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      handler.recordPublication(wg.id, 'doc-001', 'wg_report');

      expect(wg.documentsPublished).toBe(1);
      expect(wg.metrics.documentsProduced).toBe(1);
    });

    it('should throw error for non-existent WG', () => {
      expect(() =>
        handler.recordPublication('non-existent', 'doc-001', 'wg_report')
      ).toThrow('Working group not found');
    });
  });

  describe('generateStatusReport', () => {
    it('should generate status report', async () => {
      const context = createMockContext();
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);
      const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const report = await handler.generateStatusReport(
        context,
        wg.id,
        periodStart,
        periodEnd,
        [{ id: 'doc-001', type: 'wg_report', title: 'Monthly Report', publishedAt: new Date() }]
      );

      expect(report.id).toMatch(/^WGSR-/);
      expect(report.workingGroupId).toBe(wg.id);
      expect(report.documentsPublished.length).toBe(1);
    });

    it('should throw error for non-existent WG', async () => {
      const context = createMockContext();

      await expect(
        handler.generateStatusReport(
          context,
          'non-existent',
          new Date(),
          new Date(),
          []
        )
      ).rejects.toThrow('Working group not found');
    });
  });

  describe('processDissolulutionRequest', () => {
    it('should auto-approve charter expiration', async () => {
      const context = createMockContext();
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      const result = await handler.processDissolulutionRequest(context, {
        workingGroupId: wg.id,
        reason: 'Charter expired',
        requestedBy: 'system',
        requestType: 'charter_expired',
      });

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Charter has expired');
      expect(result.request.status).toBe('approved');
    });

    it('should reject voluntary dissolution without handover', async () => {
      const context = createMockContext();
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      const result = await handler.processDissolulutionRequest(context, {
        workingGroupId: wg.id,
        reason: 'Mission completed',
        requestedBy: 'chair',
        requestType: 'voluntary',
      });

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('incomplete');
    });

    it('should approve voluntary dissolution with complete handover', async () => {
      const context = createMockContext();
      const proposal = createMockApprovedProposal();
      const charter = handler.createCharter(proposal);
      const wg = handler.activateWorkingGroup(charter);

      const result = await handler.processDissolulutionRequest(context, {
        workingGroupId: wg.id,
        reason: 'Mission completed',
        requestedBy: 'chair',
        requestType: 'voluntary',
        handoverPlan: {
          openIssues: [],
          assignedTo: 'orchestrator',
          documentsArchived: true,
        },
      });

      expect(result.approved).toBe(true);
      expect(result.reason).toContain('complete handover');
    });
  });

  describe('detectPatterns', () => {
    it('should detect patterns above threshold', () => {
      const issues = Array(6).fill(null).map(() => ({
        category: 'technical_infrastructure',
        createdAt: new Date(),
      }));

      const patterns = handler.detectPatterns(issues);

      expect(patterns.length).toBe(1);
      expect(patterns[0].category).toBe('technical_infrastructure');
      expect(patterns[0].frequency).toBe(6);
    });

    it('should not detect patterns below threshold', () => {
      const issues = Array(3).fill(null).map(() => ({
        category: 'technical_infrastructure',
        createdAt: new Date(),
      }));

      const patterns = handler.detectPatterns(issues);

      expect(patterns.length).toBe(0);
    });

    it('should filter old issues outside time window', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago

      const issues = Array(10).fill(null).map(() => ({
        category: 'technical_infrastructure',
        createdAt: oldDate,
      }));

      const patterns = handler.detectPatterns(issues);

      expect(patterns.length).toBe(0);
    });
  });

  describe('generateAutoProposal', () => {
    it('should generate proposal from pattern', async () => {
      const pattern = {
        category: 'technical_infrastructure',
        frequency: 8,
        timeWindow: '30d',
        sampleIssueIds: ['issue-1', 'issue-2'],
      };

      const proposal = await handler.generateAutoProposal(pattern);

      expect(proposal.name).toBeDefined();
      expect(proposal.purpose).toBeDefined();
      expect(proposal.origin).toBe('orchestrator');
      expect(proposal.originDetails).toContain('Auto-detected');
    });
  });

  describe('requiresDualHouseApproval', () => {
    it('should always return true for WG formation', () => {
      expect(handler.requiresDualHouseApproval()).toBe(true);
    });
  });

  describe('requiresDirector3Approval', () => {
    it('should return true for high-budget WGs', () => {
      expect(handler.requiresDirector3Approval(6000)).toBe(true);
      expect(handler.requiresDirector3Approval(10000)).toBe(true);
    });

    it('should return false for low-budget or no-budget WGs', () => {
      expect(handler.requiresDirector3Approval(1000)).toBe(false);
      expect(handler.requiresDirector3Approval(undefined)).toBe(false);
    });
  });
});

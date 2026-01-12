// ===========================================
// Workflow C Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkflowCHandler,
  createWorkflowCHandler,
  DEFAULT_WORKFLOW_C_CONFIG,
  type GrantApplication,
  type DeveloperGrant,
  type MilestoneReport,
  type RetroactiveReward,
} from '../workflows/workflow-c.js';
import type { WorkflowContext } from '../types.js';
import type { LLMProvider } from '../specialist-manager.js';

// Mock LLM Provider
function createMockLLMProvider(): LLMProvider {
  return {
    generate: vi.fn().mockResolvedValue({
      content: `Technical feasibility: 8
Team capability: 7
Budget: 8
Timeline: 7
Ecosystem impact: 8
Innovation: 7
Milestone clarity: 8
Risk: 7

Strengths:
- Strong technical approach
- Clear milestones

Weaknesses:
- Timeline may be ambitious

Recommendation: Approve
This application demonstrates strong potential for ecosystem impact.

Confidence: 80`,
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
    issueId: 'test-issue-003',
    workflowType: 'C',
    currentState: 'RESEARCH',
    issue: {
      id: 'test-issue-003',
      title: 'Grant Application: Mossland SDK',
      description: 'Building a developer SDK for the Mossland ecosystem',
      category: 'technical_infrastructure',
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

// Create mock grant application
function createMockApplication(): GrantApplication {
  return {
    id: 'app-001',
    applicantId: 'dev-001',
    applicantName: 'John Developer',
    applicantWallet: '0x1234567890abcdef',
    title: 'Mossland Developer SDK',
    description: 'A comprehensive SDK for building on Mossland ecosystem',
    category: 'ecosystem_tooling',
    requestedAmount: 5000,
    currency: 'USD',
    timeline: '3 months',
    milestones: [
      {
        id: 'milestone-1',
        grantId: 'grant-001',
        title: 'Core SDK Framework',
        description: 'Build the core framework',
        deliverables: ['SDK scaffolding', 'Basic API client'],
        amount: 2000,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        id: 'milestone-2',
        grantId: 'grant-001',
        title: 'Documentation & Examples',
        description: 'Complete documentation and examples',
        deliverables: ['API docs', 'Tutorial examples'],
        amount: 1500,
        dueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
      {
        id: 'milestone-3',
        grantId: 'grant-001',
        title: 'Testing & Release',
        description: 'Testing and public release',
        deliverables: ['Test suite', 'npm package'],
        amount: 1500,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    ],
    teamMembers: ['John Developer'],
    previousWork: 'Built several open source libraries',
    githubRepo: 'https://github.com/dev/mossland-sdk',
    status: 'submitted',
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Create mock developer grant
function createMockGrant(): DeveloperGrant {
  return {
    id: 'grant-001',
    applicationId: 'app-001',
    applicantId: 'dev-001',
    applicantName: 'John Developer',
    title: 'Mossland Developer SDK',
    description: 'SDK for Mossland',
    category: 'ecosystem_tooling',
    totalAmount: 5000,
    disbursedAmount: 0,
    remainingAmount: 5000,
    currency: 'USD',
    milestones: [
      {
        id: 'milestone-1',
        grantId: 'grant-001',
        title: 'Core SDK Framework',
        description: 'Build core framework',
        deliverables: ['SDK scaffolding', 'Basic API'],
        amount: 2000,
        dueDate: new Date(),
        status: 'in_progress',
      },
    ],
    status: 'active',
    approvedAt: new Date(),
    approvedBy: {
      mossCoinHouse: true,
      openSourceHouse: true,
    },
    startDate: new Date(),
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Create mock milestone report
function createMockMilestoneReport(): MilestoneReport {
  return {
    id: 'report-001',
    grantId: 'grant-001',
    milestoneId: 'milestone-1',
    submittedBy: 'dev-001',
    title: 'Milestone 1 Completion Report',
    summary: 'Completed the core SDK framework with all planned deliverables.',
    accomplishments: [
      'Built SDK scaffolding with TypeScript',
      'Implemented basic API client',
      'Added unit tests with 85% coverage',
    ],
    challenges: ['Some API changes required refactoring'],
    nextSteps: ['Begin documentation phase'],
    evidence: [
      {
        id: 'evidence-1',
        milestoneId: 'milestone-1',
        type: 'github_pr',
        url: 'https://github.com/dev/mossland-sdk/pull/1',
        description: 'Main PR with SDK implementation',
        submittedAt: new Date(),
      },
    ],
    hoursSpent: 80,
    status: 'submitted',
    submittedAt: new Date(),
  };
}

// Create mock retroactive reward
function createMockRetroactiveReward(): RetroactiveReward {
  return {
    id: 'reward-001',
    nomineeId: 'dev-002',
    nomineeName: 'Jane Contributor',
    nomineeWallet: '0xabcdef1234567890',
    contributionDescription: 'Created comprehensive documentation and tutorials for Mossland APIs',
    evidenceLinks: [
      'https://github.com/mossland/docs/pulls?q=author:jane',
      'https://mossland.gitbook.io/tutorials',
    ],
    category: 'documentation',
    proposedAmount: 1000,
    currency: 'USD',
    nominatedBy: 'community-1',
    nominatedByType: 'agent',
    supportingVotes: 5,
    supporters: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'],
    status: 'nominated',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('WorkflowCHandler', () => {
  let handler: WorkflowCHandler;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = createMockLLMProvider();
    handler = new WorkflowCHandler(mockProvider);
  });

  describe('createWorkflowCHandler', () => {
    it('should create a handler with default config', () => {
      const h = createWorkflowCHandler(mockProvider);
      expect(h).toBeInstanceOf(WorkflowCHandler);
    });

    it('should create a handler with custom config', () => {
      const h = createWorkflowCHandler(mockProvider, {
        minGrantAmount: 500,
        maxGrantAmount: 50000,
        requireDirector3Above: 10000,
      });
      expect(h).toBeInstanceOf(WorkflowCHandler);
    });
  });

  describe('DEFAULT_WORKFLOW_C_CONFIG', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_WORKFLOW_C_CONFIG.minGrantAmount).toBe(100);
      expect(DEFAULT_WORKFLOW_C_CONFIG.maxGrantAmount).toBe(100000);
      expect(DEFAULT_WORKFLOW_C_CONFIG.requireDirector3Above).toBe(5000);
      expect(DEFAULT_WORKFLOW_C_CONFIG.maxRetroactivePercent).toBe(50);
      expect(DEFAULT_WORKFLOW_C_CONFIG.minMilestones).toBe(2);
      expect(DEFAULT_WORKFLOW_C_CONFIG.maxMilestones).toBe(10);
      expect(DEFAULT_WORKFLOW_C_CONFIG.categories).toContain('core_development');
      expect(DEFAULT_WORKFLOW_C_CONFIG.categories).toContain('ecosystem_tooling');
    });
  });

  describe('processGrantApplication', () => {
    it('should process a grant application and return proposal', async () => {
      const context = createMockContext();
      const application = createMockApplication();

      const result = await handler.processGrantApplication(context, application);

      expect(result).toHaveProperty('proposal');
      expect(result).toHaveProperty('evaluation');
      expect(result).toHaveProperty('opinions');
      expect(result.proposal.id).toMatch(/^GP-/);
      expect(result.proposal.applicationId).toBe(application.id);
      expect(result.evaluation.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.opinions.length).toBeGreaterThan(0);
    });

    it('should reject application below minimum amount', async () => {
      const context = createMockContext();
      const application = createMockApplication();
      application.requestedAmount = 50; // Below minimum

      await expect(
        handler.processGrantApplication(context, application)
      ).rejects.toThrow('Grant amount must be at least');
    });

    it('should reject application above maximum amount', async () => {
      const context = createMockContext();
      const application = createMockApplication();
      application.requestedAmount = 200000; // Above maximum

      await expect(
        handler.processGrantApplication(context, application)
      ).rejects.toThrow('Grant amount cannot exceed');
    });

    it('should reject application with too few milestones', async () => {
      const context = createMockContext();
      const application = createMockApplication();
      application.milestones = [application.milestones[0]]; // Only 1 milestone

      await expect(
        handler.processGrantApplication(context, application)
      ).rejects.toThrow('milestones required');
    });
  });

  describe('evaluateApplication', () => {
    it('should evaluate an application and return scores', async () => {
      const context = createMockContext();
      const application = createMockApplication();

      const evaluation = await handler.evaluateApplication(context, application);

      expect(evaluation.applicationId).toBe(application.id);
      expect(evaluation.scores).toBeDefined();
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.overallScore).toBeLessThanOrEqual(100);
      expect(evaluation.recommendation).toMatch(/^(approve|reject|request_changes)$/);
      expect(evaluation.strengths.length).toBeGreaterThan(0);
    });
  });

  describe('processMilestoneReport', () => {
    it('should process a milestone report and return review', async () => {
      const context = createMockContext();
      const grant = createMockGrant();
      const report = createMockMilestoneReport();

      const result = await handler.processMilestoneReport(context, grant, report);

      expect(result).toHaveProperty('review');
      expect(result).toHaveProperty('approved');
      expect(result).toHaveProperty('feedback');
      expect(result.review.milestoneId).toBe(report.milestoneId);
    });

    it('should throw error for non-existent milestone', async () => {
      const context = createMockContext();
      const grant = createMockGrant();
      const report = createMockMilestoneReport();
      report.milestoneId = 'non-existent';

      await expect(
        handler.processMilestoneReport(context, grant, report)
      ).rejects.toThrow('Milestone non-existent not found');
    });
  });

  describe('processRetroactiveReward', () => {
    it('should process a retroactive reward nomination', async () => {
      const context = createMockContext();
      const reward = createMockRetroactiveReward();

      const result = await handler.processRetroactiveReward(context, reward);

      expect(result).toHaveProperty('evaluation');
      expect(result).toHaveProperty('approved');
      expect(result.evaluation.rewardId).toBe(reward.id);
      expect(result.evaluation.impactScore).toBeGreaterThanOrEqual(0);
    });

    it('should reject reward without evidence', async () => {
      const context = createMockContext();
      const reward = createMockRetroactiveReward();
      reward.evidenceLinks = [];

      await expect(
        handler.processRetroactiveReward(context, reward)
      ).rejects.toThrow('At least one evidence link is required');
    });

    it('should reject reward with zero amount', async () => {
      const context = createMockContext();
      const reward = createMockRetroactiveReward();
      reward.proposedAmount = 0;

      await expect(
        handler.processRetroactiveReward(context, reward)
      ).rejects.toThrow('Proposed amount must be positive');
    });
  });

  describe('requiresDualHouseApproval', () => {
    it('should return true for amounts above minimum', () => {
      expect(handler.requiresDualHouseApproval(500)).toBe(true);
      expect(handler.requiresDualHouseApproval(5000)).toBe(true);
    });

    it('should return false for amounts at or below minimum', () => {
      expect(handler.requiresDualHouseApproval(100)).toBe(false);
      expect(handler.requiresDualHouseApproval(50)).toBe(false);
    });
  });

  describe('requiresDirector3Approval', () => {
    it('should return true for amounts above threshold', () => {
      expect(handler.requiresDirector3Approval(6000)).toBe(true);
      expect(handler.requiresDirector3Approval(10000)).toBe(true);
    });

    it('should return false for amounts at or below threshold', () => {
      expect(handler.requiresDirector3Approval(5000)).toBe(false);
      expect(handler.requiresDirector3Approval(1000)).toBe(false);
    });
  });

  describe('calculateDisbursement', () => {
    it('should calculate disbursement with LOCK status', () => {
      const grant = createMockGrant();
      const milestone = grant.milestones[0];

      const disbursement = handler.calculateDisbursement(grant, milestone);

      expect(disbursement.amount).toBe(milestone.amount);
      expect(disbursement.isLocked).toBe(true);
      expect(disbursement.unlockRequirements).toContain('Dual-House approval received');
    });

    it('should require Director 3 for high-value grants', () => {
      const grant = createMockGrant();
      grant.totalAmount = 10000;
      const milestone = grant.milestones[0];

      const disbursement = handler.calculateDisbursement(grant, milestone);

      expect(disbursement.unlockRequirements).toContain('Director 3 approval received');
    });
  });
});

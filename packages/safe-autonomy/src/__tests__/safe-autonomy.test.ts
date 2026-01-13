// ===========================================
// Safe Autonomy Package Tests
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RiskClassifier,
  classifyAction,
  isActionLocked,
  getActionRiskLevel,
  LockManager,
  createLockManager,
  ApprovalRouter,
  createApprovalRouter,
  PassiveConsensusManager,
  createPassiveConsensusManager,
  RetryHandler,
  createRetryHandler,
  createSafeAutonomySystem,
  DEFAULT_SAFE_AUTONOMY_CONFIG,
  SAFE_AUTONOMY_VERSION,
} from '../index.js';

describe('Safe Autonomy Package', () => {
  describe('RiskClassifier', () => {
    let classifier: RiskClassifier;

    beforeEach(() => {
      classifier = new RiskClassifier();
    });

    it('should create a risk classifier', () => {
      expect(classifier).toBeDefined();
    });

    it('should classify FUND_TRANSFER as HIGH risk', () => {
      const result = classifier.classify('FUND_TRANSFER');
      expect(result.riskLevel).toBe('HIGH');
    });

    it('should classify AGENT_CHATTER as LOW risk', () => {
      const result = classifier.classify('AGENT_CHATTER');
      expect(result.riskLevel).toBe('LOW');
    });

    it('should classify PROPOSAL_CREATE as MID risk', () => {
      const result = classifier.classify('PROPOSAL_CREATE');
      expect(result.riskLevel).toBe('MID');
    });

    it('should use classifyAction helper', () => {
      const result = classifyAction('FUND_TRANSFER');
      expect(result.riskLevel).toBe('HIGH');
    });

    it('should check if action is locked', () => {
      expect(isActionLocked('FUND_TRANSFER')).toBe(true);
      expect(isActionLocked('AGENT_CHATTER')).toBe(false);
    });

    it('should get action risk level', () => {
      expect(getActionRiskLevel('FUND_TRANSFER')).toBe('HIGH');
      expect(getActionRiskLevel('AGENT_CHATTER')).toBe('LOW');
    });

    it('should check high risk actions', () => {
      expect(classifier.isHighRisk('FUND_TRANSFER')).toBe(true);
      expect(classifier.isHighRisk('AGENT_CHATTER')).toBe(false);
    });
  });

  describe('LockManager', () => {
    let lockManager: LockManager;

    beforeEach(() => {
      lockManager = createLockManager();
    });

    it('should create a lock manager', () => {
      expect(lockManager).toBeDefined();
    });

    it('should lock HIGH risk actions', async () => {
      const action = await lockManager.lock({
        actionType: 'FUND_TRANSFER',
        description: 'Test fund transfer',
        riskLevel: 'HIGH',
        payload: { amount: 1000 },
        requestedBy: 'test-user',
      });

      expect(action).toBeDefined();
      expect(action.id).toBeDefined();
      expect(action.status).toBe('LOCKED');
    });

    it('should retrieve locked action', async () => {
      const locked = await lockManager.lock({
        actionType: 'CONTRACT_DEPLOY',
        description: 'Deploy smart contract',
        riskLevel: 'HIGH',
        payload: { contract: 'test' },
        requestedBy: 'test-user',
      });

      const retrieved = await lockManager.get(locked.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(locked.id);
    });
  });

  describe('ApprovalRouter', () => {
    let router: ApprovalRouter;

    beforeEach(() => {
      router = createApprovalRouter();
    });

    it('should create an approval router', () => {
      expect(router).toBeDefined();
    });

    it('should route LOW risk actions', async () => {
      const result = await router.route({
        actionId: 'action-001',
        actionType: 'AGENT_CHATTER',
        riskLevel: 'LOW',
        description: 'Test LOW risk action',
        requestedBy: 'test-agent',
      });

      expect(result).toBeDefined();
    });

    it('should route HIGH risk actions', async () => {
      const result = await router.route({
        actionId: 'action-002',
        actionType: 'FUND_TRANSFER',
        riskLevel: 'HIGH',
        description: 'Test HIGH risk action',
        requestedBy: 'test-agent',
      });

      expect(result).toBeDefined();
    });
  });

  describe('PassiveConsensusManager', () => {
    let pcManager: PassiveConsensusManager;

    beforeEach(() => {
      pcManager = createPassiveConsensusManager();
    });

    it('should create a passive consensus manager', () => {
      expect(pcManager).toBeDefined();
    });

    it('should create a passive consensus item', async () => {
      const item = await pcManager.create({
        proposalId: 'proposal-001',
        title: 'Test Proposal',
        summary: 'Testing passive consensus',
        riskLevel: 'LOW',
        createdBy: 'test-agent',
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.status).toBe('PENDING');
    });
  });

  describe('RetryHandler', () => {
    let retryHandler: RetryHandler;

    beforeEach(() => {
      retryHandler = createRetryHandler();
    });

    it('should create a retry handler', () => {
      expect(retryHandler).toBeDefined();
    });

    it('should create task', async () => {
      const task = await retryHandler.createTask({
        name: 'test-task',
        fn: async () => 'success',
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
    });
  });

  describe('SafeAutonomySystem', () => {
    it('should create a complete system', () => {
      const system = createSafeAutonomySystem();

      expect(system).toBeDefined();
      expect(system.lockManager).toBeDefined();
      expect(system.approvalRouter).toBeDefined();
      expect(system.passiveConsensus).toBeDefined();
      expect(system.retryHandler).toBeDefined();
      expect(system.config).toBeDefined();
    });

    it('should use default config', () => {
      expect(DEFAULT_SAFE_AUTONOMY_CONFIG).toBeDefined();
    });
  });

  describe('Package Info', () => {
    it('should have version', () => {
      expect(SAFE_AUTONOMY_VERSION).toBe('0.1.0');
    });
  });

  describe('Integration', () => {
    it('should integrate risk classification with lock management', async () => {
      const classifier = new RiskClassifier();
      const lockManager = createLockManager();

      const riskResult = classifier.classify('FUND_TRANSFER');
      expect(riskResult.riskLevel).toBe('HIGH');

      const locked = await lockManager.lock({
        actionType: 'FUND_TRANSFER',
        description: 'Integration test',
        riskLevel: riskResult.riskLevel,
        payload: { amount: 500 },
        requestedBy: 'integration-test',
      });

      expect(locked.status).toBe('LOCKED');
    });
  });
});

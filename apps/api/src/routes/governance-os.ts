// ===========================================
// Governance OS API Routes
// ===========================================
// REST API endpoints for v2.0 GovernanceOS integration

import { Router, type Request, type Response } from 'express';
import type { GovernanceOSBridge } from '../services/governance-os-bridge';
import type { RiskLevel } from '@algora/safe-autonomy';
import type { WorkflowType } from '@algora/orchestrator';
import type { DocumentType } from '@algora/document-registry';

const router: Router = Router();

// Helper to get bridge from app.locals
function getBridge(req: Request): GovernanceOSBridge {
  return req.app.locals.governanceOSBridge;
}

// ==========================================
// Pipeline Endpoints
// ==========================================

/**
 * POST /governance-os/pipeline/run
 * Run a governance pipeline for an issue
 */
router.post('/pipeline/run', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { issueId, workflowType, riskLevel } = req.body;

    if (!issueId) {
      return res.status(400).json({ error: 'issueId is required' });
    }

    const result = await bridge.runPipelineForIssue(issueId, {
      workflowType: workflowType as WorkflowType,
      riskLevel: riskLevel as RiskLevel,
    });

    return res.json({
      success: result.success,
      pipelineId: result.context.id,
      status: result.status,
      stage: result.context.stage,
      documents: result.documents,
    });
  } catch (error) {
    console.error('[GovernanceOS] Pipeline error:', error);
    return res.status(500).json({
      error: 'Pipeline execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/pipeline/issue/:issueId
 * Get pipelines executed for an issue
 */
router.get('/pipeline/issue/:issueId', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { issueId } = req.params;

    const pipelines = bridge.getPipelinesForIssue(issueId);

    return res.json({
      issueId,
      pipelines,
      count: pipelines.length,
    });
  } catch (error) {
    console.error('[GovernanceOS] Get pipelines error:', error);
    return res.status(500).json({
      error: 'Failed to get pipelines',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Document Registry Endpoints
// ==========================================

/**
 * POST /governance-os/documents
 * Create a document from a proposal
 */
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { proposalId, documentType } = req.body;

    if (!proposalId || !documentType) {
      return res.status(400).json({ error: 'proposalId and documentType are required' });
    }

    const doc = await bridge.createDocumentFromProposal(
      proposalId,
      documentType as DocumentType
    );

    if (!doc) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    return res.status(201).json({ document: doc });
  } catch (error) {
    console.error('[GovernanceOS] Create document error:', error);
    return res.status(500).json({
      error: 'Failed to create document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/documents/:documentId
 * Get a document by ID
 */
router.get('/documents/:documentId', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { documentId } = req.params;

    const doc = await bridge.getDocument(documentId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({ document: doc });
  } catch (error) {
    console.error('[GovernanceOS] Get document error:', error);
    return res.status(500).json({
      error: 'Failed to get document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/documents/type/:type
 * List documents by type
 */
router.get('/documents/type/:type', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { type } = req.params;

    const documents = await bridge.listDocumentsByType(type as DocumentType);

    return res.json({
      type,
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error('[GovernanceOS] List documents error:', error);
    return res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Dual-House Voting Endpoints
// ==========================================

/**
 * POST /governance-os/voting
 * Create a dual-house voting session
 */
router.post('/voting', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { proposalId, title, summary, riskLevel, category, createdBy } = req.body;

    if (!proposalId || !title) {
      return res.status(400).json({ error: 'proposalId and title are required' });
    }

    const voting = await bridge.createDualHouseVoting({
      proposalId,
      title,
      summary: summary || title,
      riskLevel: (riskLevel as RiskLevel) || 'LOW',
      category: category || 'general',
      createdBy: createdBy || 'api',
    });

    return res.status(201).json({ voting });
  } catch (error) {
    console.error('[GovernanceOS] Create voting error:', error);
    return res.status(500).json({
      error: 'Failed to create voting session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/voting/:votingId
 * Get voting session details
 */
router.get('/voting/:votingId', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { votingId } = req.params;

    const voting = await bridge.getVoting(votingId);

    if (!voting) {
      return res.status(404).json({ error: 'Voting session not found' });
    }

    return res.json({ voting });
  } catch (error) {
    console.error('[GovernanceOS] Get voting error:', error);
    return res.status(500).json({
      error: 'Failed to get voting session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /governance-os/voting/:votingId/vote
 * Cast a vote in dual-house voting
 */
router.post('/voting/:votingId/vote', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { votingId } = req.params;
    const { house, voterId, vote, weight } = req.body;

    if (!house || !voterId || !vote) {
      return res.status(400).json({
        error: 'house, voterId, and vote are required',
      });
    }

    if (!['mosscoin', 'opensource'].includes(house)) {
      return res.status(400).json({
        error: 'house must be either "mosscoin" or "opensource"',
      });
    }

    if (!['for', 'against', 'abstain'].includes(vote)) {
      return res.status(400).json({
        error: 'vote must be "for", "against", or "abstain"',
      });
    }

    await bridge.castVote({
      votingId,
      house,
      voterId,
      vote,
      weight: weight || 1,
    });

    return res.json({ success: true, votingId, house, voterId, vote });
  } catch (error) {
    console.error('[GovernanceOS] Cast vote error:', error);
    return res.status(500).json({
      error: 'Failed to cast vote',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// High-Risk Approval Endpoints
// ==========================================

/**
 * POST /governance-os/approvals
 * Create a high-risk approval request
 */
router.post('/approvals', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { proposalId, votingId, actionDescription, actionType } = req.body;

    if (!proposalId || !votingId || !actionDescription || !actionType) {
      return res.status(400).json({
        error: 'proposalId, votingId, actionDescription, and actionType are required',
      });
    }

    const approval = await bridge.createHighRiskApproval({
      proposalId,
      votingId,
      actionDescription,
      actionType,
    });

    return res.status(201).json({ approval });
  } catch (error) {
    console.error('[GovernanceOS] Create approval error:', error);
    return res.status(500).json({
      error: 'Failed to create approval request',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /governance-os/approvals/:approvalId/approve
 * Approve a high-risk action (Director 3)
 */
router.post('/approvals/:approvalId/approve', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { approvalId } = req.params;
    const { approverId } = req.body;

    if (!approverId) {
      return res.status(400).json({ error: 'approverId is required' });
    }

    const approval = await bridge.approveHighRisk(approvalId, approverId);

    if (!approval) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    return res.json({ approval, approved: true });
  } catch (error) {
    console.error('[GovernanceOS] Approve high-risk error:', error);
    return res.status(500).json({
      error: 'Failed to approve',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Risk & Lock Endpoints
// ==========================================

/**
 * GET /governance-os/risk/classify/:actionType
 * Classify the risk level of an action
 */
router.get('/risk/classify/:actionType', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { actionType } = req.params;

    const riskLevel = bridge.classifyRisk(actionType);

    return res.json({ actionType, riskLevel });
  } catch (error) {
    console.error('[GovernanceOS] Classify risk error:', error);
    return res.status(500).json({
      error: 'Failed to classify risk',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/locks/:actionId
 * Check if an action is locked
 */
router.get('/locks/:actionId', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { actionId } = req.params;

    const isLocked = await bridge.isActionLocked(actionId);

    return res.json({ actionId, isLocked });
  } catch (error) {
    console.error('[GovernanceOS] Check lock error:', error);
    return res.status(500).json({
      error: 'Failed to check lock status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Model Router Endpoints
// ==========================================

/**
 * POST /governance-os/model-router/execute
 * Execute a task using the model router
 */
router.post('/model-router/execute', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { content, taskType, maxTokens } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await bridge.executeWithModelRouter({
      content,
      taskType,
      maxTokens,
    });

    return res.json(result);
  } catch (error) {
    console.error('[GovernanceOS] Model router error:', error);
    return res.status(500).json({
      error: 'Failed to execute with model router',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Stats & Health Endpoints
// ==========================================

/**
 * GET /governance-os/stats
 * Get GovernanceOS statistics
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const stats = bridge.getStats();
    return res.json({ stats });
  } catch (error) {
    console.error('[GovernanceOS] Get stats error:', error);
    return res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/health
 * Get system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const health = await bridge.getHealth();
    return res.json(health);
  } catch (error) {
    console.error('[GovernanceOS] Get health error:', error);
    return res.status(500).json({
      error: 'Failed to get health status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/config
 * Get configuration
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const osConfig = bridge.getOSConfig();
    const bridgeConfig = bridge.getBridgeConfig();

    return res.json({
      governanceOS: osConfig,
      bridge: bridgeConfig,
    });
  } catch (error) {
    console.error('[GovernanceOS] Get config error:', error);
    return res.status(500).json({
      error: 'Failed to get config',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

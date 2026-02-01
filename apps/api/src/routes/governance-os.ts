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
 * GET /governance-os/documents
 * List all documents with optional filters
 */
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { type, state, limit, offset } = req.query;

    const result = await bridge.listAllDocuments({
      type: type as DocumentType | undefined,
      state: state as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    return res.json({
      documents: result.documents,
      total: result.total,
    });
  } catch (error) {
    console.error('[GovernanceOS] List documents error:', error);
    return res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
 * GET /governance-os/voting
 * List all voting sessions with optional filters
 */
router.get('/voting', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { status, limit, offset } = req.query;

    const result = await bridge.listAllVotings({
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    return res.json({
      sessions: result.sessions,
      total: result.total,
    });
  } catch (error) {
    console.error('[GovernanceOS] List voting sessions error:', error);
    return res.status(500).json({
      error: 'Failed to list voting sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
 * GET /governance-os/approvals
 * List all high-risk approvals (locked actions) with optional filters
 */
router.get('/approvals', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { status, limit, offset } = req.query;

    const result = await bridge.listAllApprovals({
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    return res.json({
      actions: result.actions,
      total: result.total,
    });
  } catch (error) {
    console.error('[GovernanceOS] List approvals error:', error);
    return res.status(500).json({
      error: 'Failed to list approvals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/approvals/:approvalId
 * Get a specific high-risk approval by ID
 */
router.get('/approvals/:approvalId', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const { approvalId } = req.params;

    const approval = await bridge.getApproval(approvalId);

    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    return res.json({ approval });
  } catch (error) {
    console.error('[GovernanceOS] Get approval error:', error);
    return res.status(500).json({
      error: 'Failed to get approval',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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

/**
 * GET /governance-os/model-router/stats
 * Get model router statistics (requests, tokens, costs, tier usage)
 */
router.get('/model-router/stats', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const stats = bridge.getModelRouterStats();

    return res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GovernanceOS] Get model router stats error:', error);
    return res.status(500).json({
      error: 'Failed to get model router stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Workflow Status Endpoints
// ==========================================

/**
 * GET /governance-os/workflows
 * Get workflow statuses for all workflow types
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const workflows = await bridge.getWorkflowStatuses();

    return res.json({ workflows });
  } catch (error) {
    console.error('[GovernanceOS] Get workflows error:', error);
    return res.status(500).json({
      error: 'Failed to get workflow statuses',
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

// ==========================================
// KPI Endpoints (Section O)
// ==========================================

/**
 * GET /governance-os/kpi/dashboard
 * Get the full KPI dashboard
 */
router.get('/kpi/dashboard', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      return res.json({
        decisionQuality: {
          dpCompleteness: 100,
          optionDiversity: 3,
          redTeamCoverage: 100,
          evidenceDepth: 3,
          confidenceCalibration: 10,
        },
        executionSpeed: {
          signalToIssueMs: 0,
          issueToDecisionMs: 0,
          dpToApprovalMs: 0,
          approvalToExecutionMs: 0,
          endToEndMs: 0,
        },
        systemHealth: {
          uptime: 100,
          heartbeatGapMs: 0,
          llmAvailability: 100,
          queueDepth: 0,
          errorRate: 0,
        },
        timestamp: new Date(),
      });
    }

    const dashboard = kpiCollector.getDashboard();
    return res.json(dashboard);
  } catch (error) {
    console.error('[GovernanceOS] Get KPI dashboard error:', error);
    return res.status(500).json({
      error: 'Failed to get KPI dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/decision-quality
 * Get Decision Quality metrics
 */
router.get('/kpi/decision-quality', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      return res.json({
        dpCompleteness: 100,
        optionDiversity: 3,
        redTeamCoverage: 100,
        evidenceDepth: 3,
        confidenceCalibration: 10,
      });
    }

    const metrics = kpiCollector.getDecisionQualityMetrics();
    return res.json(metrics);
  } catch (error) {
    console.error('[GovernanceOS] Get decision quality error:', error);
    return res.status(500).json({
      error: 'Failed to get decision quality metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/execution-speed
 * Get Execution Speed metrics
 */
router.get('/kpi/execution-speed', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      return res.json({
        signalToIssueMs: 0,
        issueToDecisionMs: 0,
        dpToApprovalMs: 0,
        approvalToExecutionMs: 0,
        endToEndMs: 0,
      });
    }

    const metrics = kpiCollector.getExecutionSpeedMetrics();
    return res.json(metrics);
  } catch (error) {
    console.error('[GovernanceOS] Get execution speed error:', error);
    return res.status(500).json({
      error: 'Failed to get execution speed metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/system-health
 * Get System Health metrics
 */
router.get('/kpi/system-health', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      return res.json({
        uptime: 100,
        heartbeatGapMs: 0,
        llmAvailability: 100,
        queueDepth: 0,
        errorRate: 0,
      });
    }

    const metrics = kpiCollector.getSystemHealthMetrics();
    return res.json(metrics);
  } catch (error) {
    console.error('[GovernanceOS] Get system health error:', error);
    return res.status(500).json({
      error: 'Failed to get system health metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/alerts
 * Get recent KPI alerts
 */
router.get('/kpi/alerts', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();
    const limit = parseInt(req.query.limit as string) || 50;

    if (!kpiCollector) {
      return res.json({ alerts: [], total: 0 });
    }

    const alerts = kpiCollector.getAlerts(limit);
    return res.json({ alerts, total: alerts.length });
  } catch (error) {
    console.error('[GovernanceOS] Get KPI alerts error:', error);
    return res.status(500).json({
      error: 'Failed to get KPI alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/targets
 * Get KPI target thresholds
 */
router.get('/kpi/targets', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      // Return default targets
      return res.json({
        decisionQuality: {
          dpCompleteness: 100,
          optionDiversity: 3,
          redTeamCoverage: 100,
          evidenceDepth: 3,
          confidenceCalibration: 10,
        },
        executionSpeed: {
          signalToIssueMs: 3600000,
          issueToDecisionMs: 86400000,
          dpToApprovalMs: 259200000,
          approvalToExecutionMs: 3600000,
          endToEndMs: 432000000,
        },
        systemHealth: {
          uptime: 99.9,
          heartbeatGapMs: 30000,
          llmAvailability: 99,
          queueDepth: 100,
          errorRate: 1,
        },
      });
    }

    const targets = kpiCollector.getTargets();
    return res.json(targets);
  } catch (error) {
    console.error('[GovernanceOS] Get KPI targets error:', error);
    return res.status(500).json({
      error: 'Failed to get KPI targets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /governance-os/kpi/export
 * Export metrics in Prometheus-compatible format
 */
router.get('/kpi/export', (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const governanceOS = bridge.getGovernanceOS();
    const kpiCollector = governanceOS.getKPICollector();

    if (!kpiCollector) {
      return res.json({});
    }

    const metrics = kpiCollector.exportMetrics();
    return res.json(metrics);
  } catch (error) {
    console.error('[GovernanceOS] Export KPI metrics error:', error);
    return res.status(500).json({
      error: 'Failed to export KPI metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Translation Endpoints
// ==========================================

/**
 * POST /governance-os/translate
 * Translate text to Korean
 */
router.post('/translate', async (req: Request, res: Response) => {
  try {
    const { text, targetLanguage = 'ko' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Use LLM for translation
    const { llmService } = await import('../services/llm.js');

    const languageNames: Record<string, string> = {
      ko: 'Korean',
      en: 'English',
      ja: 'Japanese',
      zh: 'Chinese',
    };

    const targetName = languageNames[targetLanguage] || 'Korean';

    const response = await llmService.generate({
      systemPrompt: `You are a professional translator. Translate the following text to ${targetName}. Only output the translation, no explanations or notes.`,
      prompt: text,
      maxTokens: 500,
      temperature: 0.3,
      tier: 1,
      complexity: 'fast',
    });

    return res.json({
      success: true,
      original: text,
      translated: response.content,
      targetLanguage,
      model: response.model,
      tier: response.tier,
    });
  } catch (error) {
    console.error('[GovernanceOS] Translation error:', error);
    return res.status(500).json({
      error: 'Failed to translate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /governance-os/translate/batch
 * Translate multiple texts to Korean (for batch translation)
 */
router.post('/translate/batch', async (req: Request, res: Response) => {
  try {
    const { texts, targetLanguage = 'ko' } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts array is required' });
    }

    if (texts.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 texts per batch' });
    }

    const { llmService } = await import('../services/llm.js');

    const languageNames: Record<string, string> = {
      ko: 'Korean',
      en: 'English',
      ja: 'Japanese',
      zh: 'Chinese',
    };

    const targetName = languageNames[targetLanguage] || 'Korean';

    // Batch translate using a single prompt
    const numberedTexts = texts.map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n');

    const response = await llmService.generate({
      systemPrompt: `You are a professional translator. Translate each numbered text to ${targetName}. Keep the same numbering format [1], [2], etc. Only output the translations.`,
      prompt: numberedTexts,
      maxTokens: 1500,
      temperature: 0.3,
      tier: 1,
      complexity: 'balanced',
    });

    // Parse the response back into individual translations
    const translatedLines = response.content.split('\n').filter((line: string) => line.trim());
    const translations: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const pattern = new RegExp(`\\[${i + 1}\\]\\s*(.+)`, 'i');
      const match = translatedLines.find((line: string) => pattern.test(line));
      if (match) {
        const extracted = match.replace(pattern, '$1').trim();
        translations.push(extracted);
      } else {
        translations.push(texts[i]); // Fallback to original
      }
    }

    return res.json({
      success: true,
      translations: texts.map((original: string, i: number) => ({
        original,
        translated: translations[i] || original,
      })),
      targetLanguage,
      model: response.model,
      tier: response.tier,
    });
  } catch (error) {
    console.error('[GovernanceOS] Batch translation error:', error);
    return res.status(500).json({
      error: 'Failed to batch translate',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// Admin / Maintenance Endpoints
// ==========================================

/**
 * POST /governance-os/admin/backfill-proposals
 * Backfill missing proposals from completed Agora sessions.
 *
 * This processes sessions that completed without auto-proposal creation:
 * - Session status is 'completed'
 * - Session has an issue_id
 * - Session has at least 3 rounds completed
 * - Issue priority is 'high' or 'critical'
 * - No existing proposal for this issue
 */
router.post('/admin/backfill-proposals', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);

    console.log('[GovernanceOS] Starting proposal backfill...');
    const result = await bridge.backfillMissingProposals();

    return res.json({
      success: true,
      message: `Backfill completed: ${result.created} proposals created`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GovernanceOS] Backfill proposals error:', error);
    return res.status(500).json({
      error: 'Failed to backfill proposals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /governance-os/admin/process-backlog
 * Process the full backlog: backfill proposals, auto-progress stale drafts, resolve expired votings.
 * This is a comprehensive endpoint to unstick the governance pipeline.
 */
router.post('/admin/process-backlog', async (req: Request, res: Response) => {
  try {
    const bridge = getBridge(req);
    const proposalService = req.app.locals.proposalService;

    const results: Record<string, unknown> = {};

    // Step 1: Backfill missing proposals from completed Agora sessions
    console.log('[GovernanceOS] Backlog: Step 1 - Backfilling missing proposals...');
    const backfillResult = await bridge.backfillMissingProposals();
    results.backfill = backfillResult;

    // Step 2: Auto-progress stale draft proposals
    if (proposalService) {
      console.log('[GovernanceOS] Backlog: Step 2 - Auto-progressing stale proposals...');
      const progressResult = proposalService.autoProgressProposals();
      results.autoProgress = progressResult;

      // Step 3: Resolve expired votings
      console.log('[GovernanceOS] Backlog: Step 3 - Resolving expired votings...');
      const votingResult = proposalService.resolveCompletedVotings();
      results.votingResolution = votingResult;
    }

    return res.json({
      success: true,
      message: 'Backlog processing completed',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GovernanceOS] Process backlog error:', error);
    return res.status(500).json({
      error: 'Failed to process backlog',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

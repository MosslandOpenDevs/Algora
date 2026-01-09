import { Router } from 'express';
import type { ProofOfOutcomeService } from '../services/proof-of-outcome';

export const outcomesRouter = Router();

// ========================================
// Outcome Endpoints
// ========================================

// GET /api/outcomes - List outcomes
outcomesRouter.get('/', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { status, limit = '50', offset = '0' } = req.query;

  try {
    const outcomes = poo.outcomes.getAll({
      status: status as any,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json({ outcomes });
  } catch (error) {
    console.error('Failed to fetch outcomes:', error);
    res.status(500).json({ error: 'Failed to fetch outcomes' });
  }
});

// GET /api/outcomes/pending - Get pending outcomes
outcomesRouter.get('/pending', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const outcomes = poo.outcomes.getPending();
    res.json({ outcomes });
  } catch (error) {
    console.error('Failed to fetch pending outcomes:', error);
    res.status(500).json({ error: 'Failed to fetch pending outcomes' });
  }
});

// GET /api/outcomes/stats - Get outcome statistics
outcomesRouter.get('/stats', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const stats = poo.outcomes.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get outcome stats:', error);
    res.status(500).json({ error: 'Failed to get outcome stats' });
  }
});

// GET /api/outcomes/:id - Get outcome with details
outcomesRouter.get('/:id', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;

  try {
    const result = poo.outcomes.getOutcomeWithDetails(id);
    if (!result) {
      res.status(404).json({ error: 'Outcome not found' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Failed to fetch outcome:', error);
    res.status(500).json({ error: 'Failed to fetch outcome' });
  }
});

// POST /api/outcomes/from-proposal/:proposalId - Create outcome from proposal
outcomesRouter.post('/from-proposal/:proposalId', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { proposalId } = req.params;
  const { decision } = req.body;

  if (!decision || !['approved', 'rejected', 'deferred'].includes(decision)) {
    res.status(400).json({ error: 'decision must be "approved", "rejected", or "deferred"' });
    return;
  }

  try {
    const outcome = poo.outcomes.createFromProposal(proposalId, decision);
    res.status(201).json({ outcome });
  } catch (error: any) {
    console.error('Failed to create outcome:', error);
    res.status(400).json({ error: error.message || 'Failed to create outcome' });
  }
});

// ========================================
// Execution Endpoints
// ========================================

// POST /api/outcomes/:id/plan - Set execution plan
outcomesRouter.post('/:id/plan', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { plan, steps } = req.body;

  if (!plan || !steps || !Array.isArray(steps)) {
    res.status(400).json({ error: 'plan and steps array are required' });
    return;
  }

  try {
    const outcome = poo.outcomes.setExecutionPlan(id, plan, steps);
    res.json({ outcome });
  } catch (error: any) {
    console.error('Failed to set execution plan:', error);
    res.status(400).json({ error: error.message || 'Failed to set execution plan' });
  }
});

// POST /api/outcomes/:id/start - Start execution
outcomesRouter.post('/:id/start', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { executor } = req.body;

  if (!executor) {
    res.status(400).json({ error: 'executor is required' });
    return;
  }

  try {
    const outcome = poo.outcomes.startExecution(id, executor);
    res.json({ outcome });
  } catch (error: any) {
    console.error('Failed to start execution:', error);
    res.status(400).json({ error: error.message || 'Failed to start execution' });
  }
});

// PUT /api/outcomes/:id/steps/:stepNumber - Update execution step
outcomesRouter.put('/:id/steps/:stepNumber', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id, stepNumber } = req.params;
  const { status, result, error } = req.body;

  if (!status || !['pending', 'in_progress', 'completed', 'failed', 'skipped'].includes(status)) {
    res.status(400).json({ error: 'valid status is required' });
    return;
  }

  try {
    const step = poo.outcomes.updateStep(id, parseInt(stepNumber), status, result, error);
    res.json({ step });
  } catch (error: any) {
    console.error('Failed to update step:', error);
    res.status(400).json({ error: error.message || 'Failed to update step' });
  }
});

// POST /api/outcomes/:id/complete - Complete execution
outcomesRouter.post('/:id/complete', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { resultSummary, evidence = [] } = req.body;

  if (!resultSummary) {
    res.status(400).json({ error: 'resultSummary is required' });
    return;
  }

  try {
    const outcome = poo.outcomes.completeExecution(id, resultSummary, evidence);
    res.json({ outcome });
  } catch (error: any) {
    console.error('Failed to complete execution:', error);
    res.status(400).json({ error: error.message || 'Failed to complete execution' });
  }
});

// POST /api/outcomes/:id/fail - Fail execution
outcomesRouter.post('/:id/fail', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    res.status(400).json({ error: 'reason is required' });
    return;
  }

  try {
    const outcome = poo.outcomes.failExecution(id, reason);
    res.json({ outcome });
  } catch (error: any) {
    console.error('Failed to fail execution:', error);
    res.status(400).json({ error: error.message || 'Failed to fail execution' });
  }
});

// ========================================
// Verification Endpoints
// ========================================

// POST /api/outcomes/:id/verify - Add verification
outcomesRouter.post('/:id/verify', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { verifierId, verifierType = 'human', result, confidence = 0.5, evidence = [], notes } = req.body;

  if (!verifierId || !result) {
    res.status(400).json({ error: 'verifierId and result are required' });
    return;
  }

  if (!['success', 'partial', 'failure'].includes(result)) {
    res.status(400).json({ error: 'result must be "success", "partial", or "failure"' });
    return;
  }

  try {
    const verification = poo.outcomes.addVerification(id, verifierId, verifierType, result, confidence, evidence, notes);
    res.status(201).json({ verification });
  } catch (error: any) {
    console.error('Failed to add verification:', error);
    res.status(400).json({ error: error.message || 'Failed to add verification' });
  }
});

// GET /api/outcomes/:id/verifications - Get verifications
outcomesRouter.get('/:id/verifications', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;

  try {
    const verifications = poo.outcomes.getVerifications(id);
    res.json({ verifications });
  } catch (error) {
    console.error('Failed to get verifications:', error);
    res.status(500).json({ error: 'Failed to get verifications' });
  }
});

// POST /api/outcomes/:id/dispute - Dispute outcome
outcomesRouter.post('/:id/dispute', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { id } = req.params;
  const { disputedBy, reason } = req.body;

  if (!disputedBy || !reason) {
    res.status(400).json({ error: 'disputedBy and reason are required' });
    return;
  }

  try {
    const outcome = poo.outcomes.disputeOutcome(id, disputedBy, reason);
    res.json({ outcome });
  } catch (error: any) {
    console.error('Failed to dispute outcome:', error);
    res.status(400).json({ error: error.message || 'Failed to dispute outcome' });
  }
});

// ========================================
// Trust Scoring Endpoints
// ========================================

// GET /api/outcomes/trust/scores - Get all trust scores
outcomesRouter.get('/trust/scores', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { orderBy, limit = '100' } = req.query;

  try {
    const scores = poo.trustScoring.getAllScores({
      orderBy: orderBy as any,
      limit: parseInt(limit as string),
    });
    res.json({ scores });
  } catch (error) {
    console.error('Failed to get trust scores:', error);
    res.status(500).json({ error: 'Failed to get trust scores' });
  }
});

// GET /api/outcomes/trust/top - Get top agents
outcomesRouter.get('/trust/top', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { limit = '10' } = req.query;

  try {
    const agents = poo.trustScoring.getTopAgents(parseInt(limit as string));
    res.json({ agents });
  } catch (error) {
    console.error('Failed to get top agents:', error);
    res.status(500).json({ error: 'Failed to get top agents' });
  }
});

// GET /api/outcomes/trust/stats - Get trust scoring stats
outcomesRouter.get('/trust/stats', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const stats = poo.trustScoring.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get trust stats:', error);
    res.status(500).json({ error: 'Failed to get trust stats' });
  }
});

// GET /api/outcomes/trust/:agentId - Get agent trust score
outcomesRouter.get('/trust/:agentId', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { agentId } = req.params;

  try {
    const score = poo.trustScoring.getAgentScore(agentId);
    if (!score) {
      res.status(404).json({ error: 'Agent trust score not found' });
      return;
    }
    const history = poo.trustScoring.getTrustHistory(agentId, 20);
    const predictions = poo.trustScoring.getAgentPredictions(agentId, 20);
    res.json({ score, history, predictions });
  } catch (error) {
    console.error('Failed to get agent trust:', error);
    res.status(500).json({ error: 'Failed to get agent trust' });
  }
});

// POST /api/outcomes/trust/:agentId/predict - Record prediction
outcomesRouter.post('/trust/:agentId/predict', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { agentId } = req.params;
  const { proposalId, prediction, confidence = 0.5, reasoning } = req.body;

  if (!proposalId || !prediction || !['pass', 'fail'].includes(prediction)) {
    res.status(400).json({ error: 'proposalId and prediction (pass/fail) are required' });
    return;
  }

  try {
    const record = poo.trustScoring.recordPrediction(agentId, proposalId, prediction, confidence, reasoning);
    res.status(201).json({ prediction: record });
  } catch (error: any) {
    console.error('Failed to record prediction:', error);
    res.status(400).json({ error: error.message || 'Failed to record prediction' });
  }
});

// ========================================
// Analytics Endpoints
// ========================================

// GET /api/outcomes/analytics/dashboard - Get full analytics dashboard
outcomesRouter.get('/analytics/dashboard', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const dashboard = poo.getDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Failed to get dashboard:', error);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

// GET /api/outcomes/analytics/governance - Get governance metrics
outcomesRouter.get('/analytics/governance', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { startDate, endDate } = req.query;

  try {
    const metrics = poo.analytics.getGovernanceMetrics(startDate as string, endDate as string);
    res.json({ metrics });
  } catch (error) {
    console.error('Failed to get governance metrics:', error);
    res.status(500).json({ error: 'Failed to get governance metrics' });
  }
});

// GET /api/outcomes/analytics/trends - Get time series trends
outcomesRouter.get('/analytics/trends', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { interval = 'week', limit = '12' } = req.query;

  try {
    const proposals = poo.analytics.getProposalTimeSeries(interval as any, parseInt(limit as string));
    const voting = poo.analytics.getVotingTimeSeries(interval as any, parseInt(limit as string));
    const outcomes = poo.analytics.getOutcomeTimeSeries(interval as any, parseInt(limit as string));
    res.json({ proposals, voting, outcomes });
  } catch (error) {
    console.error('Failed to get trends:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

// GET /api/outcomes/analytics/agents - Get agent performance ranking
outcomesRouter.get('/analytics/agents', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { limit = '20' } = req.query;

  try {
    const ranking = poo.analytics.getAgentPerformanceRanking(parseInt(limit as string));
    res.json({ ranking });
  } catch (error) {
    console.error('Failed to get agent ranking:', error);
    res.status(500).json({ error: 'Failed to get agent ranking' });
  }
});

// GET /api/outcomes/analytics/agents/:agentId - Get agent activity breakdown
outcomesRouter.get('/analytics/agents/:agentId', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { agentId } = req.params;

  try {
    const activity = poo.analytics.getAgentActivityBreakdown(agentId);
    const history = poo.analytics.getAgentPerformanceHistory(agentId, 30);
    res.json({ activity, history });
  } catch (error) {
    console.error('Failed to get agent analytics:', error);
    res.status(500).json({ error: 'Failed to get agent analytics' });
  }
});

// GET /api/outcomes/analytics/signals - Get signal effectiveness
outcomesRouter.get('/analytics/signals', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const effectiveness = poo.analytics.getSignalEffectiveness();
    const correlation = poo.analytics.getSignalToOutcomeCorrelation();
    res.json({ effectiveness, correlation });
  } catch (error) {
    console.error('Failed to get signal analytics:', error);
    res.status(500).json({ error: 'Failed to get signal analytics' });
  }
});

// GET /api/outcomes/analytics/categories - Get category analytics
outcomesRouter.get('/analytics/categories', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;

  try {
    const categories = poo.analytics.getCategoryAnalytics();
    res.json({ categories });
  } catch (error) {
    console.error('Failed to get category analytics:', error);
    res.status(500).json({ error: 'Failed to get category analytics' });
  }
});

// GET /api/outcomes/analytics/report - Export governance report
outcomesRouter.get('/analytics/report', (req, res) => {
  const poo: ProofOfOutcomeService = req.app.locals.proofOfOutcome;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate and endDate are required' });
    return;
  }

  try {
    const report = poo.analytics.exportGovernanceReport(startDate as string, endDate as string);
    res.json(report);
  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

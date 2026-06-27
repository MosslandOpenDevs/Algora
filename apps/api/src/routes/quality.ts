import { Router } from 'express';
import type { Request, Response } from 'express';
import type { QualityGateService, QualityCheckType } from '../services/quality-gate-service';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';

export const qualityRouter: Router = Router();

// GET /api/quality/stats - Get quality statistics
qualityRouter.get('/stats', (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const stats = service.getStats();
  res.json(stats);
});

// GET /api/quality/history - Get quality check history
qualityRouter.get('/history', (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { type, passed, limit, offset } = req.query;

  const history = service.getHistory({
    type: type as QualityCheckType,
    passed: passed === 'true' ? true : passed === 'false' ? false : undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  res.json({
    history,
    count: history.length,
  });
});

// POST /api/quality/check - Perform quality check
qualityRouter.post('/check', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { content, type, options } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const validTypes: QualityCheckType[] = [
    'agent_chatter',
    'agora_message',
    'decision_packet',
    'summary',
    'analysis',
    'general',
  ];

  const checkType: QualityCheckType = validTypes.includes(type) ? type : 'general';

  const result = service.check(content, checkType, options);

  res.json({
    passed: result.passed,
    confidence: result.confidence,
    issues: result.issues,
    suggestions: result.suggestions,
    requiresReview: result.requiresReview,
    escalated: result.escalated,
  });
});

// POST /api/quality/check/chatter - Check agent chatter
qualityRouter.post('/check/chatter', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const result = service.checkChatter(content);
  res.json(result);
});

// POST /api/quality/check/agora - Check Agora message
qualityRouter.post('/check/agora', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const result = service.checkAgoraMessage(content);
  res.json(result);
});

// POST /api/quality/check/decision-packet - Check decision packet
qualityRouter.post('/check/decision-packet', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const result = service.checkDecisionPacket(content);
  res.json(result);
});

// POST /api/quality/check/summary - Check summary
qualityRouter.post('/check/summary', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { content } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }

  const result = service.checkSummary(content);
  res.json(result);
});

// DELETE /api/quality/history/old - Clear old quality check logs
qualityRouter.delete('/history/old', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const service: QualityGateService | undefined = req.app.locals.qualityGateService;

  if (!service) {
    return res.status(503).json({ error: 'Quality gate service not available' });
  }

  const { retentionDays } = req.query;
  const days = retentionDays ? Number(retentionDays) : 30;

  const deleted = service.clearOldLogs(days);

  res.json({
    success: true,
    deleted,
    message: `Deleted ${deleted} old quality check logs`,
  });
});

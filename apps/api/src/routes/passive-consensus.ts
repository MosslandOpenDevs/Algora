import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PassiveConsensusService } from '../services/passive-consensus';

export const passiveConsensusRouter: Router = Router();

// GET /api/passive-consensus - Get all items
passiveConsensusRouter.get('/', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { status } = req.query;
    const items = await service.getAll(status as any);

    res.json({
      items: items.map(item => ({
        id: item.id,
        documentId: item.documentId,
        documentType: item.documentType,
        riskLevel: item.riskLevel,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
        autoApprovedAt: item.autoApprovedAt?.toISOString(),
        unreviewedByHuman: item.unreviewedByHuman,
        vetoCount: item.vetoes.length,
        escalationCount: item.escalations.length,
      })),
      count: items.length,
    });
  } catch (error) {
    console.error('Failed to fetch passive consensus items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/passive-consensus/pending - Get pending items
passiveConsensusRouter.get('/pending', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const items = await service.getPending();

    res.json({
      items: items.map(item => {
        const now = Date.now();
        const timeRemaining = Math.max(0, item.reviewPeriodEndsAt.getTime() - now);

        return {
          id: item.id,
          documentId: item.documentId,
          documentType: item.documentType,
          riskLevel: item.riskLevel,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
          unreviewedByHuman: item.unreviewedByHuman,
          timeRemainingMs: timeRemaining,
          timeRemainingHours: Math.round(timeRemaining / (60 * 60 * 1000) * 10) / 10,
        };
      }),
      count: items.length,
    });
  } catch (error) {
    console.error('Failed to fetch pending items:', error);
    res.status(500).json({ error: 'Failed to fetch pending items' });
  }
});

// GET /api/passive-consensus/stats - Get statistics
passiveConsensusRouter.get('/stats', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const stats = await service.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch passive consensus stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/passive-consensus/:documentId - Get status for a document
passiveConsensusRouter.get('/:documentId', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { documentId } = req.params;
    const item = await service.getByDocumentId(documentId);

    if (!item) {
      return res.status(404).json({ error: 'No consensus item for this document' });
    }

    const now = Date.now();
    const timeRemaining = Math.max(0, item.reviewPeriodEndsAt.getTime() - now);

    res.json({
      id: item.id,
      documentId: item.documentId,
      documentType: item.documentType,
      riskLevel: item.riskLevel,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
      autoApprovedAt: item.autoApprovedAt?.toISOString(),
      unreviewedByHuman: item.unreviewedByHuman,
      vetoes: item.vetoes,
      escalations: item.escalations,
      timeRemainingMs: timeRemaining,
      timeRemainingHours: Math.round(timeRemaining / (60 * 60 * 1000) * 10) / 10,
      isApproved: item.status === 'APPROVED_BY_TIMEOUT' || item.status === 'EXPLICITLY_APPROVED',
      isVetoed: item.status === 'VETOED',
      isEscalated: item.status === 'ESCALATED',
      isPending: item.status === 'PENDING',
    });
  } catch (error) {
    console.error('Failed to fetch consensus status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// POST /api/passive-consensus - Create a new consensus item
passiveConsensusRouter.post('/', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { documentId, documentType, riskLevel } = req.body;

    if (!documentId || !documentType || !riskLevel) {
      return res.status(400).json({ error: 'Missing required fields: documentId, documentType, riskLevel' });
    }

    if (!['LOW', 'MID', 'HIGH'].includes(riskLevel)) {
      return res.status(400).json({ error: 'riskLevel must be LOW, MID, or HIGH' });
    }

    const item = await service.createConsensus({ documentId, documentType, riskLevel });

    res.status(201).json({
      id: item.id,
      documentId: item.documentId,
      documentType: item.documentType,
      riskLevel: item.riskLevel,
      status: item.status,
      reviewPeriodEndsAt: item.reviewPeriodEndsAt.toISOString(),
      unreviewedByHuman: item.unreviewedByHuman,
    });
  } catch (error) {
    console.error('Failed to create consensus item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// POST /api/passive-consensus/:documentId/approve - Explicitly approve
passiveConsensusRouter.post('/:documentId/approve', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { documentId } = req.params;
    const { approverId = 'admin', approverType = 'human' } = req.body;

    const item = await service.approve(documentId, approverId, approverType);

    res.json({
      success: true,
      id: item.id,
      status: item.status,
      unreviewedByHuman: item.unreviewedByHuman,
    });
  } catch (error: any) {
    console.error('Failed to approve:', error);
    res.status(400).json({ error: error.message || 'Failed to approve' });
  }
});

// POST /api/passive-consensus/:documentId/veto - Veto a document
passiveConsensusRouter.post('/:documentId/veto', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { documentId } = req.params;
    const { vetoerId = 'admin', vetoerType = 'human', reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const item = await service.veto(documentId, vetoerId, vetoerType, reason);

    res.json({
      success: true,
      id: item.id,
      status: item.status,
    });
  } catch (error: any) {
    console.error('Failed to veto:', error);
    res.status(400).json({ error: error.message || 'Failed to veto' });
  }
});

// POST /api/passive-consensus/:documentId/escalate - Escalate to Director 3
passiveConsensusRouter.post('/:documentId/escalate', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const { documentId } = req.params;
    const { escalatorId = 'admin', escalatorType = 'human', reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const item = await service.escalate(documentId, escalatorId, escalatorType, reason);

    res.json({
      success: true,
      id: item.id,
      status: item.status,
    });
  } catch (error: any) {
    console.error('Failed to escalate:', error);
    res.status(400).json({ error: error.message || 'Failed to escalate' });
  }
});

// POST /api/passive-consensus/process - Manually trigger processing of expired items
passiveConsensusRouter.post('/process', async (req: Request, res: Response) => {
  const service: PassiveConsensusService | undefined = req.app.locals.passiveConsensusService;

  if (!service) {
    return res.status(503).json({ error: 'Passive consensus service not available' });
  }

  try {
    const count = await service.processExpiredItems();

    res.json({
      success: true,
      processedCount: count,
      message: `Processed ${count} expired items`,
    });
  } catch (error) {
    console.error('Failed to process expired items:', error);
    res.status(500).json({ error: 'Failed to process expired items' });
  }
});

import { Router } from 'express';
import type { GovernanceService } from '../services/governance';
import { requireAdmin } from '../middleware/auth';

export const auditRouter: Router = Router();

// GET /api/audit/recent - latest audit entries (public for transparency)
auditRouter.get('/recent', (req, res) => {
  const governance: GovernanceService | undefined = req.app.locals.governance;
  if (!governance) {
    res.status(503).json({ error: 'Governance service unavailable' });
    return;
  }
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 500);
  res.json({ entries: governance.audit.recent(limit) });
});

// GET /api/audit/subject/:id - full chain slice for one proposal/delegation
auditRouter.get('/subject/:id', (req, res) => {
  const governance: GovernanceService | undefined = req.app.locals.governance;
  if (!governance) {
    res.status(503).json({ error: 'Governance service unavailable' });
    return;
  }
  res.json({ entries: governance.audit.getBySubject(req.params.id) });
});

// GET /api/audit/verify - verify the entire chain (admin only, can be slow)
auditRouter.get('/verify', requireAdmin, (req, res) => {
  const governance: GovernanceService | undefined = req.app.locals.governance;
  if (!governance) {
    res.status(503).json({ error: 'Governance service unavailable' });
    return;
  }
  res.json(governance.audit.verify());
});

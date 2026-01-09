import { Router } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { IssueDetectionService } from '../services/issue-detection';

export const issuesRouter = Router();

// GET /api/issues - List issues
issuesRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { status, category, priority, limit = '50', offset = '0' } = req.query;

  try {
    let query = 'SELECT * FROM issues WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (priority) {
      query += ' AND priority = ?';
      params.push(priority);
    }

    query += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const issues = db.prepare(query).all(...params);

    res.json({ issues });
  } catch (error) {
    console.error('Failed to fetch issues:', error);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// GET /api/issues/:id - Get single issue
issuesRouter.get('/:id', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;

  try {
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({ issue });
  } catch (error) {
    console.error('Failed to fetch issue:', error);
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// POST /api/issues - Create issue
issuesRouter.post('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const {
    title,
    description,
    category,
    priority,
    signalIds,
    evidence,
    suggestedActions,
  } = req.body;

  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO issues (id, title, description, category, priority, detected_at, signal_ids, evidence, suggested_actions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      description,
      category,
      priority,
      now,
      signalIds ? JSON.stringify(signalIds) : null,
      evidence ? JSON.stringify(evidence) : null,
      suggestedActions ? JSON.stringify(suggestedActions) : null
    );

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);

    // Emit socket event
    io.emit('issues:detected', { issue });

    res.status(201).json({ issue });
  } catch (error) {
    console.error('Failed to create issue:', error);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// PATCH /api/issues/:id - Update issue
issuesRouter.patch('/:id', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;
  const { status, decisionPacket, resolvedAt } = req.body;

  try {
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE issues
      SET status = COALESCE(?, status),
          decision_packet = COALESCE(?, decision_packet),
          resolved_at = COALESCE(?, resolved_at),
          updated_at = ?
      WHERE id = ?
    `).run(
      status,
      decisionPacket ? JSON.stringify(decisionPacket) : null,
      resolvedAt,
      now,
      id
    );

    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);

    res.json({ issue });
  } catch (error) {
    console.error('Failed to update issue:', error);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// ========================================
// Issue Detection Endpoints
// ========================================

// GET /api/issues/detection/stats - Get detection statistics
issuesRouter.get('/detection/stats', (req, res) => {
  const issueDetection: IssueDetectionService = req.app.locals.issueDetection;

  if (!issueDetection) {
    return res.status(503).json({ error: 'Issue detection service not available' });
  }

  try {
    const stats = issueDetection.getStats();
    res.json({ stats });
  } catch (error) {
    console.error('Failed to get detection stats:', error);
    res.status(500).json({ error: 'Failed to get detection stats' });
  }
});

// POST /api/issues/detection/run - Manually trigger detection
issuesRouter.post('/detection/run', async (req, res) => {
  const issueDetection: IssueDetectionService = req.app.locals.issueDetection;

  if (!issueDetection) {
    return res.status(503).json({ error: 'Issue detection service not available' });
  }

  try {
    await issueDetection.runDetection();
    res.json({ success: true, message: 'Detection cycle completed' });
  } catch (error) {
    console.error('Failed to run detection:', error);
    res.status(500).json({ error: 'Failed to run detection' });
  }
});

// GET /api/issues/:id/signals - Get issue with related signals
issuesRouter.get('/:id/signals', (req, res) => {
  const issueDetection: IssueDetectionService = req.app.locals.issueDetection;
  const { id } = req.params;

  if (!issueDetection) {
    return res.status(503).json({ error: 'Issue detection service not available' });
  }

  try {
    const issue = issueDetection.getIssueWithSignals(id);
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json({ issue });
  } catch (error) {
    console.error('Failed to get issue with signals:', error);
    res.status(500).json({ error: 'Failed to get issue with signals' });
  }
});

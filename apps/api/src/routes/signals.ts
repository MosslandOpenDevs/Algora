import { Router } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export const signalsRouter = Router();

// GET /api/signals - List signals
signalsRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const {
    category,
    severity,
    source,
    limit = '100',
    offset = '0',
  } = req.query;

  try {
    let query = 'SELECT * FROM signals WHERE 1=1';
    const params: any[] = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }
    if (source) {
      query += ' AND source LIKE ?';
      params.push(`${source}:%`);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const signals = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM signals WHERE 1=1';
    const countParams: any[] = [];
    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }
    if (severity) {
      countQuery += ' AND severity = ?';
      countParams.push(severity);
    }
    if (source) {
      countQuery += ' AND source LIKE ?';
      countParams.push(`${source}:%`);
    }

    const { count } = db.prepare(countQuery).get(...countParams) as { count: number };

    res.json({ signals, total: count });
  } catch (error) {
    console.error('Failed to fetch signals:', error);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// POST /api/signals - Create signal
signalsRouter.post('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const {
    originalId,
    source,
    category,
    severity,
    value,
    unit,
    description,
    metadata,
  } = req.body;

  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO signals (id, original_id, source, timestamp, category, severity, value, unit, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      originalId || id,
      source,
      now,
      category,
      severity,
      value,
      unit,
      description,
      metadata ? JSON.stringify(metadata) : null
    );

    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(id);

    // Emit socket event
    io.emit('signals:collected', { signal });

    res.status(201).json({ signal });
  } catch (error) {
    console.error('Failed to create signal:', error);
    res.status(500).json({ error: 'Failed to create signal' });
  }
});

// GET /api/signals/stats - Get signal statistics
signalsRouter.get('/stats', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    const stats = {
      total: (db.prepare('SELECT COUNT(*) as count FROM signals').get() as any).count,
      byCategory: db.prepare(`
        SELECT category, COUNT(*) as count
        FROM signals
        GROUP BY category
        ORDER BY count DESC
      `).all(),
      bySeverity: db.prepare(`
        SELECT severity, COUNT(*) as count
        FROM signals
        GROUP BY severity
        ORDER BY count DESC
      `).all(),
      bySource: db.prepare(`
        SELECT source, COUNT(*) as count
        FROM signals
        GROUP BY source
        ORDER BY count DESC
      `).all(),
      last24h: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE timestamp > datetime('now', '-24 hours')
      `).get() as any).count,
    };

    res.json({ stats });
  } catch (error) {
    console.error('Failed to fetch signal stats:', error);
    res.status(500).json({ error: 'Failed to fetch signal stats' });
  }
});

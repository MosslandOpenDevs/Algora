import { Router } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';

export const signalsRouter: Router = Router();

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
signalsRouter.post('/', writeLimiter, requireAdmin, (req, res) => {
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

// GET /api/signals/live-stats - Get time-based signal statistics for live dashboard
signalsRouter.get('/live-stats', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    // Time-based counts
    const timeStats = {
      last10min: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE timestamp > datetime('now', '-10 minutes')
      `).get() as any).count,
      lastHour: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE timestamp > datetime('now', '-1 hour')
      `).get() as any).count,
      today: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE date(timestamp) = date('now')
      `).get() as any).count,
      thisWeek: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE timestamp > datetime('now', '-7 days')
      `).get() as any).count,
      thisMonth: (db.prepare(`
        SELECT COUNT(*) as count
        FROM signals
        WHERE timestamp > datetime('now', '-30 days')
      `).get() as any).count,
      total: (db.prepare('SELECT COUNT(*) as count FROM signals').get() as any).count,
    };

    // Hourly breakdown for today (last 24 hours)
    const hourlyBreakdown = db.prepare(`
      SELECT
        strftime('%H', timestamp) as hour,
        COUNT(*) as count
      FROM signals
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY strftime('%H', timestamp)
      ORDER BY hour
    `).all();

    // Recent signals per minute (last 10 minutes) for real-time pulse
    const minuteBreakdown = db.prepare(`
      SELECT
        strftime('%H:%M', timestamp) as minute,
        COUNT(*) as count
      FROM signals
      WHERE timestamp > datetime('now', '-10 minutes')
      GROUP BY strftime('%H:%M', timestamp)
      ORDER BY minute
    `).all();

    // Category breakdown for current period
    const categoryBreakdown = db.prepare(`
      SELECT
        category,
        COUNT(*) as count
      FROM signals
      WHERE timestamp > datetime('now', '-1 hour')
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // Source breakdown for current period
    const sourceBreakdown = db.prepare(`
      SELECT
        source,
        COUNT(*) as count
      FROM signals
      WHERE timestamp > datetime('now', '-1 hour')
      GROUP BY source
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // Calculate rate (signals per minute in last 10 min)
    const ratePerMinute = timeStats.last10min / 10;

    res.json({
      timeStats,
      hourlyBreakdown,
      minuteBreakdown,
      categoryBreakdown,
      sourceBreakdown,
      ratePerMinute: Math.round(ratePerMinute * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch live signal stats:', error);
    res.status(500).json({ error: 'Failed to fetch live signal stats' });
  }
});

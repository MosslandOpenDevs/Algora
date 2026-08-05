import { Router } from 'express';
import type Database from 'better-sqlite3';
import { isoHoursAgo } from '../utils/time';

export const activityRouter: Router = Router();

// GET /api/activity - Get recent activity (root path)
activityRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { limit = '20', type } = req.query;

  try {
    let query = 'SELECT * FROM activity_log WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const activities = db.prepare(query).all(...params);

    res.json({ activities });
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// GET /api/activity/recent - Get recent activity
activityRouter.get('/recent', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { limit = '100', type, severity } = req.query;

  try {
    let query = 'SELECT * FROM activity_log WHERE 1=1';
    const params: any[] = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (severity) {
      query += ' AND severity = ?';
      params.push(severity);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const activities = db.prepare(query).all(...params);

    res.json({ activities });
  } catch (error) {
    console.error('Failed to fetch activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// GET /api/activity/stats - Get activity statistics
activityRouter.get('/stats', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    const stats = {
      total: (db.prepare('SELECT COUNT(*) as count FROM activity_log').get() as any).count,
      last24h: (db.prepare(`
        SELECT COUNT(*) as count FROM activity_log
        WHERE timestamp > ?
      `).get(isoHoursAgo(24)) as any).count,
      byType: db.prepare(`
        SELECT type, COUNT(*) as count
        FROM activity_log
        WHERE timestamp > ?
        GROUP BY type
        ORDER BY count DESC
      `).all(isoHoursAgo(24)),
      bySeverity: db.prepare(`
        SELECT severity, COUNT(*) as count
        FROM activity_log
        WHERE timestamp > ?
        GROUP BY severity
      `).all(isoHoursAgo(24)),
    };

    res.json({ stats });
  } catch (error) {
    console.error('Failed to fetch activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

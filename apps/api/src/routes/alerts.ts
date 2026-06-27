import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { writeLimiter } from '../middleware/rate-limit';
import { requireAdmin } from '../middleware/auth';

export const alertsRouter: Router = Router();

interface AlertRow {
  id: string;
  metric_name: string;
  alert_type: string;
  severity: string;
  current_value: number;
  threshold: number;
  message: string;
  acknowledged: number;
  timestamp: string;
}

// GET /api/alerts - Get all alerts
alertsRouter.get('/', (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;
  const { acknowledged, limit = '50', metric_name } = req.query;

  try {
    let query = 'SELECT * FROM governance_kpi_alerts WHERE 1=1';
    const params: unknown[] = [];

    if (acknowledged !== undefined) {
      query += ' AND acknowledged = ?';
      params.push(acknowledged === 'true' ? 1 : 0);
    }

    if (metric_name) {
      query += ' AND metric_name = ?';
      params.push(metric_name);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit as string, 10));

    const alerts = db.prepare(query).all(...params) as AlertRow[];

    res.json({
      alerts: alerts.map(alert => ({
        id: alert.id,
        metricName: alert.metric_name,
        alertType: alert.alert_type,
        severity: alert.severity,
        currentValue: alert.current_value,
        threshold: alert.threshold,
        message: alert.message,
        acknowledged: alert.acknowledged === 1,
        timestamp: alert.timestamp,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/alerts/count - Get count of unacknowledged alerts
alertsRouter.get('/count', (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;

  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM governance_kpi_alerts
      WHERE acknowledged = 0
    `).get() as { count: number };

    res.json({ count: result.count });
  } catch (error) {
    console.error('Failed to fetch alert count:', error);
    res.status(500).json({ error: 'Failed to fetch alert count' });
  }
});

// GET /api/alerts/budget - Get budget-specific alerts
alertsRouter.get('/budget', (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;
  const { acknowledged, limit = '20' } = req.query;

  try {
    let query = `
      SELECT * FROM governance_kpi_alerts
      WHERE metric_name = 'budget_usage'
    `;
    const params: unknown[] = [];

    if (acknowledged !== undefined) {
      query += ' AND acknowledged = ?';
      params.push(acknowledged === 'true' ? 1 : 0);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit as string, 10));

    const alerts = db.prepare(query).all(...params) as AlertRow[];

    res.json({
      alerts: alerts.map(alert => ({
        id: alert.id,
        alertType: alert.alert_type,
        severity: alert.severity,
        percentUsed: alert.current_value,
        threshold: alert.threshold,
        message: alert.message,
        acknowledged: alert.acknowledged === 1,
        timestamp: alert.timestamp,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch budget alerts:', error);
    res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

// PATCH /api/alerts/:id/acknowledge - Acknowledge an alert
alertsRouter.patch('/:id/acknowledge', writeLimiter, (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;

  try {
    const result = db.prepare(`
      UPDATE governance_kpi_alerts
      SET acknowledged = 1
      WHERE id = ?
    `).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to acknowledge alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// PATCH /api/alerts/acknowledge-all - Acknowledge all alerts
alertsRouter.patch('/acknowledge-all', writeLimiter, (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;
  const { metric_name } = req.query;

  try {
    let query = 'UPDATE governance_kpi_alerts SET acknowledged = 1 WHERE acknowledged = 0';
    const params: unknown[] = [];

    if (metric_name) {
      query += ' AND metric_name = ?';
      params.push(metric_name);
    }

    const result = db.prepare(query).run(...params);

    res.json({ success: true, acknowledgedCount: result.changes });
  } catch (error) {
    console.error('Failed to acknowledge all alerts:', error);
    res.status(500).json({ error: 'Failed to acknowledge all alerts' });
  }
});

// DELETE /api/alerts/:id - Delete an alert
alertsRouter.delete('/:id', writeLimiter, requireAdmin, (req: Request, res: Response) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;

  try {
    const result = db.prepare('DELETE FROM governance_kpi_alerts WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to delete alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

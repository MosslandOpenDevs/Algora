import { Router } from 'express';
import type Database from 'better-sqlite3';

export const statsRouter: Router = Router();

// GET /api/stats - Get dashboard statistics
statsRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    // Count active agents (status !== 'idle')
    const activeAgents = (db.prepare(`
      SELECT COUNT(*) as count FROM agent_states
      WHERE status != 'idle' AND status IS NOT NULL
    `).get() as any)?.count || 0;

    // Count active agora sessions
    const activeSessions = (db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE status = 'active'
    `).get() as any)?.count || 0;

    // Count signals today
    const signalsToday = (db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE date(created_at) = date('now')
    `).get() as any)?.count || 0;

    // Count open issues
    const openIssues = (db.prepare(`
      SELECT COUNT(*) as count FROM issues
      WHERE status IN ('open', 'in_progress')
    `).get() as any)?.count || 0;

    // Calculate trends (compare to yesterday)
    // Signals trend: compare today vs yesterday
    const signalsYesterday = (db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE date(created_at) = date('now', '-1 day')
    `).get() as any)?.count || 0;
    const signalsTrend = signalsYesterday > 0
      ? Math.round(((signalsToday - signalsYesterday) / signalsYesterday) * 100)
      : signalsToday > 0 ? 100 : 0;

    // Sessions trend: compare active sessions today vs yesterday
    const sessionsYesterday = (db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE date(created_at) = date('now', '-1 day')
    `).get() as any)?.count || 0;
    const sessionsToday = (db.prepare(`
      SELECT COUNT(*) as count FROM agora_sessions
      WHERE date(created_at) = date('now')
    `).get() as any)?.count || 0;
    const sessionsTrend = sessionsYesterday > 0
      ? Math.round(((sessionsToday - sessionsYesterday) / sessionsYesterday) * 100)
      : sessionsToday > 0 ? 100 : 0;

    // Agents trend: compare agent activity (messages) today vs yesterday
    const agentMessagesYesterday = (db.prepare(`
      SELECT COUNT(*) as count FROM agent_chatter
      WHERE date(created_at) = date('now', '-1 day')
    `).get() as any)?.count || 0;
    const agentMessagesToday = (db.prepare(`
      SELECT COUNT(*) as count FROM agent_chatter
      WHERE date(created_at) = date('now')
    `).get() as any)?.count || 0;
    const agentsTrend = agentMessagesYesterday > 0
      ? Math.round(((agentMessagesToday - agentMessagesYesterday) / agentMessagesYesterday) * 100)
      : agentMessagesToday > 0 ? 100 : 0;

    res.json({
      activeAgents,
      activeSessions,
      signalsToday,
      openIssues,
      agentsTrend,
      sessionsTrend,
      signalsTrend,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

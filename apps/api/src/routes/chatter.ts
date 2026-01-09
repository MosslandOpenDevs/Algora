import { Router } from 'express';
import type Database from 'better-sqlite3';

export const chatterRouter = Router();

// GET /api/chatter - Get recent chatter messages
chatterRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const chatter = db.prepare(`
      SELECT
        c.id,
        c.agent_id,
        c.content,
        c.tier,
        c.created_at,
        a.display_name as agent_name,
        a.color as agent_color
      FROM agent_chatter c
      JOIN agents a ON c.agent_id = a.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(limit);

    // Reverse to get chronological order
    res.json({ chatter: chatter.reverse() });
  } catch (error) {
    console.error('Failed to fetch chatter:', error);
    res.status(500).json({ error: 'Failed to fetch chatter' });
  }
});

// GET /api/chatter/agent/:agentId - Get chatter by agent
chatterRouter.get('/agent/:agentId', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { agentId } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const chatter = db.prepare(`
      SELECT
        c.id,
        c.agent_id,
        c.content,
        c.tier,
        c.created_at,
        a.display_name as agent_name,
        a.color as agent_color
      FROM agent_chatter c
      JOIN agents a ON c.agent_id = a.id
      WHERE c.agent_id = ?
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(agentId, limit);

    res.json({ chatter: chatter.reverse() });
  } catch (error) {
    console.error('Failed to fetch agent chatter:', error);
    res.status(500).json({ error: 'Failed to fetch agent chatter' });
  }
});

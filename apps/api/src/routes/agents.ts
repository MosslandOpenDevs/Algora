import { Router } from 'express';
import type Database from 'better-sqlite3';

export const agentsRouter: Router = Router();

// GET /api/agents - List all agents
agentsRouter.get('/', (req, res) => {
  const db: Database.Database = req.app.locals.db;

  try {
    const agents = db.prepare(`
      SELECT a.*, s.status, s.current_activity, s.last_chatter, s.last_active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.is_active = 1
      ORDER BY a.group_name, a.name
    `).all();

    res.json({ agents });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id - Get single agent
agentsRouter.get('/:id', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;

  try {
    const agent = db.prepare(`
      SELECT a.*, s.status, s.current_activity, s.last_chatter, s.last_active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.id = ?
    `).get(id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// GET /api/agents/group/:groupName - Get agents by group
agentsRouter.get('/group/:groupName', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { groupName } = req.params;

  try {
    const agents = db.prepare(`
      SELECT a.*, s.status, s.current_activity, s.last_chatter, s.last_active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.group_name = ? AND a.is_active = 1
      ORDER BY a.name
    `).all(groupName);

    res.json({ agents });
  } catch (error) {
    console.error('Failed to fetch agents by group:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// PATCH /api/agents/:id/state - Update agent state
agentsRouter.patch('/:id/state', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;
  const { status, currentActivity } = req.body;

  try {
    const result = db.prepare(`
      UPDATE agent_states
      SET status = COALESCE(?, status),
          current_activity = COALESCE(?, current_activity),
          last_active = CURRENT_TIMESTAMP
      WHERE agent_id = ?
    `).run(status, currentActivity, id);

    if (result.changes === 0) {
      // Create state if it doesn't exist
      db.prepare(`
        INSERT INTO agent_states (agent_id, status, current_activity, last_active)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(id, status || 'idle', currentActivity);
    }

    // Emit socket event
    const io = req.app.locals.io;
    io.emit('agent:state_changed', { agentId: id, status, currentActivity });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update agent state:', error);
    res.status(500).json({ error: 'Failed to update agent state' });
  }
});

// POST /api/agents/:id/summon - Summon an agent (activate)
agentsRouter.post('/:id/summon', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { id } = req.params;

  try {
    // Check if agent exists
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update agent state to active
    const result = db.prepare(`
      UPDATE agent_states
      SET status = 'active',
          current_activity = 'Summoned to participate',
          last_active = CURRENT_TIMESTAMP
      WHERE agent_id = ?
    `).run(id);

    if (result.changes === 0) {
      // Create state if it doesn't exist
      db.prepare(`
        INSERT INTO agent_states (agent_id, status, current_activity, last_active)
        VALUES (?, 'active', 'Summoned to participate', CURRENT_TIMESTAMP)
      `).run(id);
    }

    // Log activity
    const activityId = `summon-${id}-${Date.now()}`;
    db.prepare(`
      INSERT INTO activity_log (id, type, message, severity, timestamp, agent_id, metadata)
      VALUES (?, 'AGENT_SUMMONED', ?, 'info', datetime('now'), ?, ?)
    `).run(
      activityId,
      `${agent.display_name || agent.name} has been summoned`,
      id,
      JSON.stringify({ action: 'summon', agentName: agent.name })
    );

    // Emit socket events
    io.emit('agent:state_changed', { agentId: id, status: 'active', currentActivity: 'Summoned to participate' });
    io.emit('agent:summoned', { agentId: id, agent });

    res.json({ success: true, agent: { ...agent, status: 'active' } });
  } catch (error) {
    console.error('Failed to summon agent:', error);
    res.status(500).json({ error: 'Failed to summon agent' });
  }
});

// POST /api/agents/:id/dismiss - Dismiss an agent (deactivate)
agentsRouter.post('/:id/dismiss', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { id } = req.params;

  try {
    // Check if agent exists
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update agent state to idle
    const result = db.prepare(`
      UPDATE agent_states
      SET status = 'idle',
          current_activity = NULL,
          last_active = CURRENT_TIMESTAMP
      WHERE agent_id = ?
    `).run(id);

    if (result.changes === 0) {
      // Create state if it doesn't exist
      db.prepare(`
        INSERT INTO agent_states (agent_id, status, current_activity, last_active)
        VALUES (?, 'idle', NULL, CURRENT_TIMESTAMP)
      `).run(id);
    }

    // Log activity
    const activityId = `dismiss-${id}-${Date.now()}`;
    db.prepare(`
      INSERT INTO activity_log (id, type, message, severity, timestamp, agent_id, metadata)
      VALUES (?, 'AGENT_DISMISSED', ?, 'info', datetime('now'), ?, ?)
    `).run(
      activityId,
      `${agent.display_name || agent.name} has been dismissed`,
      id,
      JSON.stringify({ action: 'dismiss', agentName: agent.name })
    );

    // Emit socket events
    io.emit('agent:state_changed', { agentId: id, status: 'idle', currentActivity: null });
    io.emit('agent:dismissed', { agentId: id, agent });

    res.json({ success: true, agent: { ...agent, status: 'idle' } });
  } catch (error) {
    console.error('Failed to dismiss agent:', error);
    res.status(500).json({ error: 'Failed to dismiss agent' });
  }
});

// GET /api/chatter/recent - Get recent chatter
agentsRouter.get('/chatter/recent', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const chatter = db.prepare(`
      SELECT c.*, a.name as agent_name, a.display_name, a.color
      FROM agent_chatter c
      JOIN agents a ON c.agent_id = a.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json({ chatter });
  } catch (error) {
    console.error('Failed to fetch chatter:', error);
    res.status(500).json({ error: 'Failed to fetch chatter' });
  }
});

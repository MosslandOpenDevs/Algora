import { Router } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getAgoraService, getSummoningService } from '../services/socket';

export const agoraRouter = Router();

// GET /api/agora/sessions - List all sessions
agoraRouter.get('/sessions', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const status = req.query.status as string;

  try {
    let query = `
      SELECT s.*, i.title as issue_title
      FROM agora_sessions s
      LEFT JOIN issues i ON s.issue_id = i.id
    `;

    if (status) {
      query += ` WHERE s.status = ?`;
    }

    query += ` ORDER BY s.created_at DESC`;

    const sessions = status
      ? db.prepare(query).all(status)
      : db.prepare(query).all();

    res.json({ sessions });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/agora/sessions/:id - Get single session
agoraRouter.get('/sessions/:id', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const { id } = req.params;

  try {
    const session = db.prepare(`
      SELECT s.*, i.title as issue_title, i.description as issue_description
      FROM agora_sessions s
      LEFT JOIN issues i ON s.issue_id = i.id
      WHERE s.id = ?
    `).get(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get messages
    const messages = db.prepare(`
      SELECT m.*, a.name as agent_name, a.display_name, a.color
      FROM agora_messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE m.session_id = ?
      ORDER BY m.created_at ASC
    `).all(id);

    res.json({ session, messages });
  } catch (error) {
    console.error('Failed to fetch session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/agora/sessions - Create new session
agoraRouter.post('/sessions', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { title, issueId, summonedAgents } = req.body;

  try {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agora_sessions (id, title, issue_id, summoned_agents, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, issueId || null, JSON.stringify(summonedAgents || []), now);

    const session = db.prepare('SELECT * FROM agora_sessions WHERE id = ?').get(id);

    // Emit socket event
    io.emit('agora:session_started', { session });

    res.status(201).json({ session });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/agora/sessions/:id/message - Add message to session
agoraRouter.post('/sessions/:id/message', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { id } = req.params;
  const { agentId, humanId, messageType, content, evidence, tierUsed } = req.body;

  try {
    const messageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agora_messages (id, session_id, agent_id, human_id, message_type, content, evidence, tier_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, id, agentId || null, humanId || null, messageType, content, evidence ? JSON.stringify(evidence) : null, tierUsed, now);

    const message = db.prepare(`
      SELECT m.*, a.name as agent_name, a.display_name, a.color
      FROM agora_messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE m.id = ?
    `).get(messageId);

    // Emit socket event
    io.to(`agora:${id}`).emit('agora:message', { message });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Failed to add message:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// POST /api/agora/sessions/:id/summon - Summon agent to session
agoraRouter.post('/sessions/:id/summon', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { id } = req.params;
  const { agentId, reason } = req.body;

  try {
    // Get current session
    const session = db.prepare('SELECT * FROM agora_sessions WHERE id = ?').get(id) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update summoned agents
    const summonedAgents = JSON.parse(session.summoned_agents || '[]');
    if (!summonedAgents.includes(agentId)) {
      summonedAgents.push(agentId);
      db.prepare('UPDATE agora_sessions SET summoned_agents = ? WHERE id = ?')
        .run(JSON.stringify(summonedAgents), id);
    }

    // Update agent state
    db.prepare(`
      UPDATE agent_states
      SET status = 'active', current_session_id = ?, last_active = CURRENT_TIMESTAMP
      WHERE agent_id = ?
    `).run(id, agentId);

    // Get agent info
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

    // Emit socket event
    io.emit('agent:summoned', { agentId, sessionId: id, reason, agent });

    res.json({ success: true, summonedAgents });
  } catch (error) {
    console.error('Failed to summon agent:', error);
    res.status(500).json({ error: 'Failed to summon agent' });
  }
});

// POST /api/agora/sessions/:id/conclude - Conclude session
agoraRouter.post('/sessions/:id/conclude', (req, res) => {
  const db: Database.Database = req.app.locals.db;
  const io = req.app.locals.io;
  const { id } = req.params;
  const { consensusScore } = req.body;

  try {
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE agora_sessions
      SET status = 'concluded', consensus_score = ?, concluded_at = ?
      WHERE id = ?
    `).run(consensusScore, now, id);

    // Reset agent states
    const session = db.prepare('SELECT summoned_agents FROM agora_sessions WHERE id = ?').get(id) as any;
    const summonedAgents = JSON.parse(session?.summoned_agents || '[]');

    for (const agentId of summonedAgents) {
      db.prepare(`
        UPDATE agent_states
        SET status = 'idle', current_session_id = NULL
        WHERE agent_id = ?
      `).run(agentId);
    }

    // Emit socket event
    io.emit('agora:session_concluded', { sessionId: id, consensusScore });

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to conclude session:', error);
    res.status(500).json({ error: 'Failed to conclude session' });
  }
});

// POST /api/agora/sessions/create - Create session with AgoraService
agoraRouter.post('/sessions/create', async (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { title, description, issueId, topic, maxRounds, autoSummon } = req.body;

  try {
    const session = await agoraService.createSession({
      title,
      description,
      issueId,
      topic,
      maxRounds,
      autoSummon,
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/agora/sessions/:id/participants - Get session participants
agoraRouter.get('/sessions/:id/participants', (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;

  try {
    const participants = agoraService.getParticipants(id);
    res.json({ participants });
  } catch (error) {
    console.error('Failed to get participants:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
});

// POST /api/agora/sessions/:id/participants - Add participant to session
agoraRouter.post('/sessions/:id/participants', async (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;
  const { agentId } = req.body;

  try {
    const success = await agoraService.addParticipant(id, agentId);
    res.json({ success });
  } catch (error) {
    console.error('Failed to add participant:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// DELETE /api/agora/sessions/:id/participants/:agentId - Remove participant
agoraRouter.delete('/sessions/:id/participants/:agentId', (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id, agentId } = req.params;

  try {
    const success = agoraService.removeParticipant(id, agentId);
    res.json({ success });
  } catch (error) {
    console.error('Failed to remove participant:', error);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// POST /api/agora/sessions/:id/generate - Generate agent response
agoraRouter.post('/sessions/:id/generate', async (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;
  const { agentId } = req.body;

  try {
    const message = await agoraService.generateAgentResponse(id, agentId);
    if (message) {
      res.json({ message });
    } else {
      res.status(404).json({ error: 'Session or agent not found' });
    }
  } catch (error) {
    console.error('Failed to generate response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// POST /api/agora/sessions/:id/advance - Advance to next round
agoraRouter.post('/sessions/:id/advance', (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;

  try {
    const session = agoraService.advanceRound(id);
    if (session) {
      res.json({ session });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Failed to advance round:', error);
    res.status(500).json({ error: 'Failed to advance round' });
  }
});

// POST /api/agora/sessions/:id/automated/start - Start automated discussion
agoraRouter.post('/sessions/:id/automated/start', (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;
  const { intervalMs } = req.body;

  try {
    agoraService.startAutomatedDiscussion(id, intervalMs || 15000);
    res.json({ success: true, message: 'Automated discussion started' });
  } catch (error) {
    console.error('Failed to start automated discussion:', error);
    res.status(500).json({ error: 'Failed to start automated discussion' });
  }
});

// POST /api/agora/sessions/:id/automated/stop - Stop automated discussion
agoraRouter.post('/sessions/:id/automated/stop', (req, res) => {
  const agoraService = getAgoraService();
  if (!agoraService) {
    return res.status(503).json({ error: 'Agora service not available' });
  }

  const { id } = req.params;

  try {
    agoraService.stopAutomatedDiscussion(id);
    res.json({ success: true, message: 'Automated discussion stopped' });
  } catch (error) {
    console.error('Failed to stop automated discussion:', error);
    res.status(500).json({ error: 'Failed to stop automated discussion' });
  }
});

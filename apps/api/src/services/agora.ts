import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { llmService } from './llm';
import { SummoningService } from './summoning';

interface Agent {
  id: string;
  name: string;
  display_name: string;
  group_name: string;
  persona_prompt: string;
  speaking_style: string;
  color: string;
}

interface AgoraSession {
  id: string;
  title: string;
  description: string;
  issue_id: string | null;
  status: 'active' | 'paused' | 'completed';
  current_round: number;
  max_rounds: number;
  created_at: string;
  updated_at: string;
}

interface AgoraMessage {
  id: string;
  session_id: string;
  agent_id: string | null;
  agent_name: string;
  agent_color: string;
  content: string;
  message_type: 'agent' | 'system' | 'human';
  round: number;
  tier: number;
  created_at: string;
}

interface SessionParticipant {
  agent_id: string;
  agent_name: string;
  agent_color: string;
  group_name: string;
  joined_at: string;
  status: 'active' | 'speaking' | 'listening';
}

export class AgoraService {
  private db: Database.Database;
  private io: SocketServer;
  private summoningService: SummoningService;
  private activeDiscussions: Map<string, NodeJS.Timeout> = new Map();

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.summoningService = new SummoningService(db, io);
  }

  // Create a new Agora session
  async createSession(options: {
    title: string;
    description?: string;
    issueId?: string;
    topic?: string;
    maxRounds?: number;
    autoSummon?: boolean;
  }): Promise<AgoraSession> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const session: AgoraSession = {
      id,
      title: options.title,
      description: options.description || '',
      issue_id: options.issueId || null,
      status: 'active',
      current_round: 1,
      max_rounds: options.maxRounds || 5,
      created_at: now,
      updated_at: now,
    };

    this.db.prepare(`
      INSERT INTO agora_sessions (id, title, description, issue_id, status, current_round, max_rounds, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.title,
      session.description,
      session.issue_id,
      session.status,
      session.current_round,
      session.max_rounds,
      session.created_at,
      session.updated_at
    );

    // Auto-summon relevant agents if requested
    if (options.autoSummon) {
      const summoned = await this.summoningService.summonForContext({
        topic: options.topic || options.title,
        sessionId: id,
        issueId: options.issueId,
        maxAgents: 5,
      });

      for (const { agent } of summoned) {
        await this.addParticipant(id, agent.id);
      }
    }

    // Log activity
    this.logActivity('AGORA_SESSION_START', `Session started: ${session.title}`, id);

    // Emit event
    this.io.emit('agora:sessionCreated', session);

    // Add system message
    await this.addMessage(id, {
      content: `Session "${session.title}" has started. Topic: ${session.description || 'General discussion'}`,
      messageType: 'system',
    });

    return session;
  }

  // Add a participant to a session
  async addParticipant(sessionId: string, agentId: string): Promise<boolean> {
    const agent = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(agentId) as Agent | undefined;

    if (!agent) {
      return false;
    }

    // Check if already participating
    const existing = this.db.prepare(`
      SELECT * FROM agora_participants WHERE session_id = ? AND agent_id = ?
    `).get(sessionId, agentId);

    if (existing) {
      return true;
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO agora_participants (id, session_id, agent_id, joined_at, status)
      VALUES (?, ?, ?, ?, 'active')
    `).run(uuidv4(), sessionId, agentId, now);

    // Update agent state
    this.db.prepare(`
      UPDATE agent_states
      SET status = 'active', current_session_id = ?, last_active = ?
      WHERE agent_id = ?
    `).run(sessionId, now, agentId);

    // Emit event
    this.io.emit('agora:participantJoined', {
      sessionId,
      agent: {
        id: agent.id,
        name: agent.display_name,
        color: agent.color,
        group: agent.group_name,
      },
    });

    return true;
  }

  // Remove a participant from a session
  removeParticipant(sessionId: string, agentId: string): boolean {
    this.db.prepare(`
      DELETE FROM agora_participants WHERE session_id = ? AND agent_id = ?
    `).run(sessionId, agentId);

    // Update agent state
    this.db.prepare(`
      UPDATE agent_states
      SET status = 'idle', current_session_id = NULL
      WHERE agent_id = ?
    `).run(agentId);

    this.io.emit('agora:participantLeft', { sessionId, agentId });

    return true;
  }

  // Get session participants
  getParticipants(sessionId: string): SessionParticipant[] {
    return this.db.prepare(`
      SELECT
        a.id as agent_id,
        a.display_name as agent_name,
        a.color as agent_color,
        a.group_name,
        p.joined_at,
        COALESCE(s.status, 'active') as status
      FROM agora_participants p
      JOIN agents a ON p.agent_id = a.id
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE p.session_id = ?
    `).all(sessionId) as SessionParticipant[];
  }

  // Add a message to the session
  async addMessage(
    sessionId: string,
    options: {
      agentId?: string;
      content: string;
      messageType: 'agent' | 'system' | 'human';
    }
  ): Promise<AgoraMessage> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    let agentName = 'System';
    let agentColor = '#6B7280';

    if (options.agentId) {
      const agent = this.db.prepare(`
        SELECT * FROM agents WHERE id = ?
      `).get(options.agentId) as Agent | undefined;

      if (agent) {
        agentName = agent.display_name;
        agentColor = agent.color;
      }
    } else if (options.messageType === 'human') {
      agentName = 'Human Operator';
      agentColor = '#10B981';
    }

    const message: AgoraMessage = {
      id: uuidv4(),
      session_id: sessionId,
      agent_id: options.agentId || null,
      agent_name: agentName,
      agent_color: agentColor,
      content: options.content,
      message_type: options.messageType,
      round: session.current_round,
      tier: llmService.isTier1Available() ? 1 : 0,
      created_at: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO agora_messages (id, session_id, agent_id, content, message_type, round, tier, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.id,
      message.session_id,
      message.agent_id,
      message.content,
      message.message_type,
      message.round,
      message.tier,
      message.created_at
    );

    // Emit message
    this.io.emit('agora:message', message);

    return message;
  }

  // Generate agent response for the discussion
  async generateAgentResponse(
    sessionId: string,
    agentId: string
  ): Promise<AgoraMessage | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const agent = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(agentId) as Agent | undefined;

    if (!agent) return null;

    // Get recent messages for context
    const recentMessages = this.getMessages(sessionId, 10);

    // Update agent state to speaking
    this.db.prepare(`
      UPDATE agent_states SET status = 'speaking' WHERE agent_id = ?
    `).run(agentId);

    this.io.emit('agent:stateChange', { agentId, state: 'speaking' });

    try {
      const content = await this.generateResponse(agent, session, recentMessages);

      // Add message
      const message = await this.addMessage(sessionId, {
        agentId,
        content,
        messageType: 'agent',
      });

      return message;
    } finally {
      // Reset agent state
      this.db.prepare(`
        UPDATE agent_states SET status = 'active' WHERE agent_id = ?
      `).run(agentId);

      this.io.emit('agent:stateChange', { agentId, state: 'active' });
    }
  }

  // Start automated discussion rounds
  startAutomatedDiscussion(sessionId: string, intervalMs: number = 15000): void {
    if (this.activeDiscussions.has(sessionId)) {
      return;
    }

    const runRound = async () => {
      const session = this.getSession(sessionId);
      if (!session || session.status !== 'active') {
        this.stopAutomatedDiscussion(sessionId);
        return;
      }

      const participants = this.getParticipants(sessionId);
      if (participants.length === 0) {
        return;
      }

      // Select a random participant to speak
      const speaker = participants[Math.floor(Math.random() * participants.length)];

      await this.generateAgentResponse(sessionId, speaker.agent_id);
    };

    const interval = setInterval(runRound, intervalMs);
    this.activeDiscussions.set(sessionId, interval);

    // Run first round immediately
    runRound();
  }

  // Stop automated discussion
  stopAutomatedDiscussion(sessionId: string): void {
    const interval = this.activeDiscussions.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.activeDiscussions.delete(sessionId);
    }
  }

  // Advance to next round
  advanceRound(sessionId: string): AgoraSession | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    if (session.current_round >= session.max_rounds) {
      return this.completeSession(sessionId);
    }

    const newRound = session.current_round + 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE agora_sessions
      SET current_round = ?, updated_at = ?
      WHERE id = ?
    `).run(newRound, now, sessionId);

    // Log activity
    this.logActivity('AGORA_ROUND_COMPLETE', `Round ${session.current_round} completed`, sessionId);

    // Add system message
    this.addMessage(sessionId, {
      content: `Round ${session.current_round} completed. Starting round ${newRound}.`,
      messageType: 'system',
    });

    this.io.emit('agora:roundAdvanced', { sessionId, round: newRound });

    return this.getSession(sessionId);
  }

  // Complete a session
  completeSession(sessionId: string): AgoraSession | null {
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE agora_sessions
      SET status = 'completed', updated_at = ?
      WHERE id = ?
    `).run(now, sessionId);

    // Stop automated discussion
    this.stopAutomatedDiscussion(sessionId);

    // Remove all participants
    const participants = this.getParticipants(sessionId);
    for (const p of participants) {
      this.removeParticipant(sessionId, p.agent_id);
    }

    // Add completion message
    this.addMessage(sessionId, {
      content: 'Session has been completed. Thank you for participating.',
      messageType: 'system',
    });

    this.io.emit('agora:sessionCompleted', { sessionId });

    return this.getSession(sessionId);
  }

  // Get session by ID
  getSession(sessionId: string): AgoraSession | null {
    return this.db.prepare(`
      SELECT * FROM agora_sessions WHERE id = ?
    `).get(sessionId) as AgoraSession | null;
  }

  // Get active sessions
  getActiveSessions(): AgoraSession[] {
    return this.db.prepare(`
      SELECT * FROM agora_sessions
      WHERE status = 'active'
      ORDER BY created_at DESC
    `).all() as AgoraSession[];
  }

  // Get messages for a session
  getMessages(sessionId: string, limit: number = 50): AgoraMessage[] {
    const messages = this.db.prepare(`
      SELECT
        m.id, m.session_id, m.agent_id, m.content, m.message_type, m.round, m.tier, m.created_at,
        COALESCE(a.display_name, CASE WHEN m.message_type = 'human' THEN 'Human Operator' ELSE 'System' END) as agent_name,
        COALESCE(a.color, CASE WHEN m.message_type = 'human' THEN '#10B981' ELSE '#6B7280' END) as agent_color
      FROM agora_messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE m.session_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(sessionId, limit) as AgoraMessage[];

    return messages.reverse();
  }

  private async generateResponse(
    agent: Agent,
    session: AgoraSession,
    recentMessages: AgoraMessage[]
  ): Promise<string> {
    // Try LLM generation
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const systemPrompt = this.buildSystemPrompt(agent, session);
        const prompt = this.buildConversationPrompt(recentMessages, session);

        const response = await llmService.generate({
          systemPrompt,
          prompt,
          maxTokens: 200,
          temperature: 0.7,
          tier: 1,
        });

        if (response.content) {
          return this.cleanResponse(response.content);
        }
      } catch (error) {
        console.warn('[Agora] LLM generation failed:', error);
      }
    }

    // Fallback to template response
    return this.getTemplateResponse(agent, session);
  }

  private buildSystemPrompt(agent: Agent, session: AgoraSession): string {
    return `You are ${agent.display_name}, an AI agent participating in a governance discussion.

Persona: ${agent.persona_prompt}
Speaking Style: ${agent.speaking_style || 'Professional and thoughtful'}
Group: ${agent.group_name}

Discussion Topic: ${session.title}
${session.description ? `Description: ${session.description}` : ''}
Current Round: ${session.current_round} of ${session.max_rounds}

Guidelines:
- Stay in character with your persona
- Be concise (2-4 sentences)
- Contribute meaningful insights related to the topic
- Respond to previous speakers when relevant
- Do not use any prefixes or quotes around your message`;
  }

  private buildConversationPrompt(
    recentMessages: AgoraMessage[],
    session: AgoraSession
  ): string {
    if (recentMessages.length === 0) {
      return `Start the discussion about: ${session.title}. Share your initial perspective.`;
    }

    const conversation = recentMessages
      .filter(m => m.message_type !== 'system')
      .slice(-5)
      .map(m => `${m.agent_name}: ${m.content}`)
      .join('\n');

    return `Recent conversation:
${conversation}

Continue the discussion with your perspective. Build on or respectfully challenge previous points.`;
  }

  private cleanResponse(content: string): string {
    return content
      .replace(/^[\"']|[\"']$/g, '')
      .replace(/^(Agent|AI|Assistant|Bot):\s*/i, '')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 500);
  }

  private getTemplateResponse(agent: Agent, session: AgoraSession): string {
    const templates: Record<string, string[]> = {
      visionaries: [
        'We should consider the long-term implications of this decision.',
        'This aligns with our vision for decentralized governance.',
        'Let me share a broader perspective on this matter.',
      ],
      builders: [
        'From a technical standpoint, this seems feasible.',
        'We should prototype this before committing to a full implementation.',
        'The engineering challenges here are manageable.',
      ],
      investors: [
        'The economic implications need careful consideration.',
        'This could impact token holder value significantly.',
        'We should analyze the risk-reward ratio here.',
      ],
      guardians: [
        'Security considerations must be paramount in this decision.',
        'We need to assess potential vulnerabilities.',
        'Let me highlight some risk factors to consider.',
      ],
      operatives: [
        'The data suggests interesting patterns here.',
        'Our analysis supports this direction.',
        'Let me share some relevant metrics.',
      ],
      moderators: [
        'We should ensure all perspectives are heard.',
        'This discussion is progressing constructively.',
        'Let me summarize the key points so far.',
      ],
      advisors: [
        'Based on historical precedent, I would recommend caution.',
        'My experience suggests we consider alternatives.',
        'Let me offer some guidance based on similar situations.',
      ],
    };

    const groupTemplates = templates[agent.group_name] || templates.advisors;
    return groupTemplates[Math.floor(Math.random() * groupTemplates.length)];
  }

  private hasExternalLLM(): boolean {
    const config = llmService.getConfig();
    return !!(config.tier2.anthropic || config.tier2.openai || config.tier2.gemini);
  }

  private logActivity(type: string, message: string, sessionId: string): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, 'info', ?, ?, ?)
    `).run(uuidv4(), type, new Date().toISOString(), message, sessionId);
  }
}

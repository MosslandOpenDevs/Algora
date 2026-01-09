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

// Global LLM request queue to prevent overloading local LLM
interface LLMRequest {
  sessionId: string;
  agentId: string;
  resolve: (message: AgoraMessage | null) => void;
  reject: (error: Error) => void;
}

class LLMRequestQueue {
  private queue: LLMRequest[] = [];
  private isProcessing: boolean = false;
  private minDelayMs: number = 10000; // Minimum 10 seconds between LLM calls
  private lastProcessedTime: number = 0;
  private processor: ((request: LLMRequest) => Promise<AgoraMessage | null>) | null = null;

  setProcessor(processor: (request: LLMRequest) => Promise<AgoraMessage | null>) {
    this.processor = processor;
  }

  setMinDelay(delayMs: number) {
    this.minDelayMs = delayMs;
  }

  enqueue(sessionId: string, agentId: string): Promise<AgoraMessage | null> {
    return new Promise((resolve, reject) => {
      this.queue.push({ sessionId, agentId, resolve, reject });
      console.log(`[LLM Queue] Added request for session ${sessionId.slice(0, 8)}... (queue size: ${this.queue.length})`);
      this.processNext();
    });
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0 || !this.processor) {
      return;
    }

    // Calculate delay since last processing
    const now = Date.now();
    const timeSinceLast = now - this.lastProcessedTime;
    const waitTime = Math.max(0, this.minDelayMs - timeSinceLast);

    if (waitTime > 0) {
      console.log(`[LLM Queue] Waiting ${(waitTime / 1000).toFixed(1)}s before next request...`);
      setTimeout(() => this.processNext(), waitTime);
      return;
    }

    this.isProcessing = true;
    const request = this.queue.shift()!;

    console.log(`[LLM Queue] Processing request for session ${request.sessionId.slice(0, 8)}... (remaining: ${this.queue.length})`);

    try {
      const result = await this.processor(request);
      this.lastProcessedTime = Date.now();
      request.resolve(result);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      this.isProcessing = false;
      // Process next request after a short delay
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 100);
      }
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
  }
}

// Singleton instance for global rate limiting
const globalLLMQueue = new LLMRequestQueue();

export class AgoraService {
  private db: Database.Database;
  private io: SocketServer;
  private summoningService: SummoningService;
  private activeDiscussions: Map<string, NodeJS.Timeout> = new Map();
  private static instance: AgoraService | null = null;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.summoningService = new SummoningService(db, io);

    // Store the latest instance for the queue processor
    AgoraService.instance = this;

    // Initialize the global LLM queue processor (only once, but always update reference)
    globalLLMQueue.setProcessor(async (request) => {
      if (!AgoraService.instance) {
        throw new Error('AgoraService not initialized');
      }
      return AgoraService.instance.processAgentResponse(request.sessionId, request.agentId);
    });
    // Set minimum delay between LLM calls (10 seconds)
    globalLLMQueue.setMinDelay(10000);
    console.log('[Agora] Global LLM request queue initialized (10s min delay between calls)');
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

      // Auto-start discussion if agents were summoned
      if (summoned.length > 0) {
        // Start with random intervals between 30s and 2min
        this.startAutomatedDiscussion(id, 30000, 120000);
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

    // Update summoned_agents in agora_sessions
    const session = this.db.prepare(`
      SELECT summoned_agents FROM agora_sessions WHERE id = ?
    `).get(sessionId) as { summoned_agents: string | null } | undefined;

    if (session) {
      let summonedAgents: string[] = [];
      try {
        summonedAgents = JSON.parse(session.summoned_agents || '[]');
        // Filter out null values
        summonedAgents = summonedAgents.filter(id => id !== null);
      } catch {
        summonedAgents = [];
      }

      if (!summonedAgents.includes(agentId)) {
        summonedAgents.push(agentId);
        this.db.prepare(`
          UPDATE agora_sessions SET summoned_agents = ? WHERE id = ?
        `).run(JSON.stringify(summonedAgents), sessionId);
      }
    }

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

  // Generate agent response for the discussion (uses global queue)
  async generateAgentResponse(
    sessionId: string,
    agentId: string
  ): Promise<AgoraMessage | null> {
    // Use the global queue to rate-limit LLM calls
    return globalLLMQueue.enqueue(sessionId, agentId);
  }

  // Get the current LLM queue size (for monitoring)
  static getLLMQueueSize(): number {
    return globalLLMQueue.getQueueSize();
  }

  // Internal method to process agent response (called by queue)
  private async processAgentResponse(
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

  // Start automated discussion rounds with random intervals
  startAutomatedDiscussion(sessionId: string, minIntervalMs: number = 30000, maxIntervalMs: number = 120000): void {
    if (this.activeDiscussions.has(sessionId)) {
      return;
    }

    const scheduleNextRound = () => {
      // Random interval between min and max (default: 30s to 2min)
      const randomInterval = minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs);

      const timeout = setTimeout(async () => {
        const session = this.getSession(sessionId);
        if (!session || session.status !== 'active') {
          this.stopAutomatedDiscussion(sessionId);
          return;
        }

        const participants = this.getParticipants(sessionId);
        if (participants.length === 0) {
          scheduleNextRound();
          return;
        }

        // Select a random participant to speak
        const speaker = participants[Math.floor(Math.random() * participants.length)];

        try {
          await this.generateAgentResponse(sessionId, speaker.agent_id);
        } catch (error) {
          console.error('[Agora] Failed to generate response:', error);
        }

        // Schedule next round
        scheduleNextRound();
      }, randomInterval);

      this.activeDiscussions.set(sessionId, timeout);
    };

    // Run first round after a short delay (5-10 seconds)
    const initialDelay = 5000 + Math.random() * 5000;
    const initialTimeout = setTimeout(async () => {
      const participants = this.getParticipants(sessionId);
      if (participants.length > 0) {
        const speaker = participants[Math.floor(Math.random() * participants.length)];
        try {
          await this.generateAgentResponse(sessionId, speaker.agent_id);
        } catch (error) {
          console.error('[Agora] Failed to generate initial response:', error);
        }
      }
      scheduleNextRound();
    }, initialDelay);

    this.activeDiscussions.set(sessionId, initialTimeout);
  }

  // Stop automated discussion
  stopAutomatedDiscussion(sessionId: string): void {
    const timeout = this.activeDiscussions.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
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
          complexity: 'balanced', // Use balanced model for thoughtful discussions
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

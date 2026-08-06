import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { llmService } from './llm';
import { SummoningService } from './summoning';
import type { GovernanceOSBridge } from './governance-os-bridge';
import { wrapUntrustedList, sanitizeForPrompt, UNTRUSTED_CONTEXT_NOTICE } from './prompt-safety';
import { isoMinutesAgo } from '../utils/time';

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

/**
 * Requests are served at most one per `minDelayMs`, so an unbounded queue does not
 * increase throughput — it only accumulates pending promises and pushes real work
 * further behind a backlog nobody will ever wait for. Anything past this depth is
 * rejected immediately so callers get an answer instead of a stalled request.
 */
export const LLM_QUEUE_MAX_DEPTH = 50;

export class LLMQueueFullError extends Error {
  constructor(depth: number) {
    super(`LLM request queue is full (${depth} pending)`);
    this.name = 'LLMQueueFullError';
  }
}

class LLMRequestQueue {
  private queue: LLMRequest[] = [];
  private isProcessing: boolean = false;
  private minDelayMs: number = 10000; // Minimum 10 seconds between LLM calls
  private lastProcessedTime: number = 0;
  private maxDepth: number = LLM_QUEUE_MAX_DEPTH;
  private processor: ((request: LLMRequest) => Promise<AgoraMessage | null>) | null = null;

  setProcessor(processor: (request: LLMRequest) => Promise<AgoraMessage | null>) {
    this.processor = processor;
  }

  setMinDelay(delayMs: number) {
    this.minDelayMs = delayMs;
  }

  setMaxDepth(maxDepth: number) {
    this.maxDepth = maxDepth;
  }

  enqueue(sessionId: string, agentId: string): Promise<AgoraMessage | null> {
    if (this.queue.length >= this.maxDepth) {
      console.warn(`[LLM Queue] Rejecting request: queue full (${this.queue.length})`);
      return Promise.reject(new LLMQueueFullError(this.queue.length));
    }
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

// Singleton instance for global rate limiting. Exported so its depth and
// admission policy can be observed and tested without driving a whole session.
export const globalLLMQueue = new LLMRequestQueue();

/**
 * Tier for the synthesis calls the architecture (CLAUDE.md) assigns to Tier 2:
 * "serious deliberation, Decision Packets". Per-call-site rather than a global
 * flag, because flipping LLM_DISABLE_TIER2 alone would route high-volume agent
 * chatter to a paid API while leaving Decision Packets local — the inverse of
 * the intent. Defaults to 1 (all local); set AGORA_SYNTHESIS_TIER=2 with a
 * provider key to move just these calls. A tier-2 request degrades to Ollama
 * if Tier 2 is off or fails, so this is safe to set before a key exists.
 */
const SYNTHESIS_TIER: 1 | 2 = process.env.AGORA_SYNTHESIS_TIER === '2' ? 2 : 1;

/**
 * Display cap for a single agent statement. Generous enough that the model's
 * natural stopping point (396-663 chars observed on gemma3:4b) is never cut;
 * the old 500 truncated 45.6% of statements mid-word.
 */
const AGENT_STATEMENT_MAX_CHARS = 800;

// Orchestrator configuration
const ORCHESTRATOR_CONFIG = {
  // Round progression settings
  minMessagesPerRound: 5,  // Minimum messages before considering round advancement
  maxMessagesPerRound: 12, // Force round advancement after this many messages

  // Timeout settings (in milliseconds)
  roundTimeoutMs: 10 * 60 * 1000,   // 10 minutes per round max
  sessionTimeoutMs: 60 * 60 * 1000, // 60 minutes per session max
  stagnationTimeoutMs: 3 * 60 * 1000, // 3 minutes without new message = stagnation

  // Agent IDs (using moderators as orchestrators for now)
  orchestratorAgentId: 'bridge-moderator', // Primary orchestrator
  backupOrchestratorAgentId: 'evidence-curator', // Backup orchestrator

  // Consensus thresholds
  consensusThreshold: 0.7,  // 70% agreement = consensus reached

  // Expert groups for dynamic summoning
  expertGroups: {
    security: ['risk-sentinel', 'security-auditor'],
    technical: ['product-architect', 'tech-visionary', 'code-whisperer'],
    financial: ['treasury-tactician', 'yield-hunter', 'diamond-hand'],
    community: ['community-voice', 'governance-guru'],
    legal: ['compliance-officer', 'legal-advisor'],
  } as Record<string, string[]>,
};

// Intelligent orchestrator types
interface ConsensusAnalysis {
  score: number;           // 0-1, higher = more consensus
  dominantPosition: string;
  dissenting: string[];
  agreements: string[];
  needsMoreDiscussion: boolean;
}

interface RoundSummary {
  keyPoints: string[];
  agreements: string[];
  disagreements: string[];
  openQuestions: string[];
  suggestedNextSteps: string[];
}

interface ActionItem {
  id: string;
  description: string;
  assignedGroup: string;
  priority: 'high' | 'medium' | 'low';
  status: 'proposed' | 'agreed' | 'pending';
}

interface SessionTimers {
  roundStartTime: number;
  sessionStartTime: number;
  lastMessageTime: number;
}

interface FinalSummary {
  topic: string;
  totalRounds: number;
  totalMessages: number;
  participantCount: number;
  keyDiscussionPoints: string[];
  finalConsensus: {
    score: number;
    outcome: 'strong_agreement' | 'moderate_agreement' | 'no_consensus' | 'disagreement';
    mainPosition: string;
  };
  actionItems: ActionItem[];
  recommendations: string[];
  openIssues: string[];
}

interface DecisionPacket {
  id: string;
  sessionId: string;
  title: string;
  summary: FinalSummary;
  recommendation: string;
  confidence: number;
  createdAt: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
}

export class AgoraService {
  private db: Database.Database;
  private io: SocketServer;
  private summoningService: SummoningService;
  private governanceOSBridge: GovernanceOSBridge | null = null;
  private activeDiscussions: Map<string, NodeJS.Timeout> = new Map();
  private static instance: AgoraService | null = null;
  private roundCheckInProgress: Set<string> = new Set(); // Prevent concurrent round checks
  private sessionTimers: Map<string, SessionTimers> = new Map(); // Track session/round times
  private timeoutCheckers: Map<string, NodeJS.Timeout> = new Map(); // Timeout check intervals
  private timeoutFailureCounts: Map<string, number> = new Map(); // Consecutive checkTimeouts failures
  private extractedActionItems: Map<string, ActionItem[]> = new Map(); // Action items per session

  constructor(db: Database.Database, io: SocketServer, governanceOSBridge?: GovernanceOSBridge) {
    this.db = db;
    this.io = io;
    this.summoningService = new SummoningService(db, io);
    this.governanceOSBridge = governanceOSBridge || null;
    // NOTE: this class is constructed in two places (socket.ts with the
    // bridge, issue-detection.ts without — the bridge doesn't exist yet
    // there). The setter below lets boot wiring connect the bridge to
    // instances created before it.

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

    // Boot-time recovery: any session that was 'active' before the previous
    // process exited has no timer running anymore. Without this sweep, those
    // sessions stay 'active' forever (root cause of the 161 stuck sessions
    // observed in production). Threshold is generous (24h) so we don't sweep
    // sessions that are still legitimately mid-discussion under another node.
    try {
      const result = this.cleanupStaleSessions({ maxIdleMinutes: 24 * 60 });
      if (result.cleaned > 0) {
        console.log(`[Agora] Boot recovery: closed ${result.cleaned} orphaned active session(s)`);
      }
    } catch (err) {
      console.error('[Agora] Boot recovery failed:', err);
    }
  }

  /**
   * Late-bind the GovernanceOS bridge for instances constructed before the
   * bridge exists (issue-detection's internal orchestrator). Without it,
   * completeSession() skips all governance integration — no documents, no
   * pipeline, no live deliberation → proposal promotion.
   */
  setGovernanceOSBridge(bridge: GovernanceOSBridge): void {
    this.governanceOSBridge = bridge;
    console.info('[Orchestrator] GovernanceOS Bridge connected');
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

    // Start timeout checker for intelligent orchestration
    this.startTimeoutChecker(id);

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
      tier?: number; // Optional tier override
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
      tier: options.tier ?? (llmService.isTier1Available() ? 1 : 0),
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

    // Update last message time for stagnation detection
    this.updateLastMessageTime(sessionId);

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
      const response = await this.generateResponse(agent, session, recentMessages);

      // Add message with actual tier used
      const message = await this.addMessage(sessionId, {
        agentId,
        content: response.content,
        messageType: 'agent',
        tier: response.tier,
      });

      // Check if orchestrator should advance the round (non-blocking)
      this.checkRoundAdvancement(sessionId).catch(err => {
        console.error('[Orchestrator] Error checking round advancement:', err);
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

  /**
   * Pick who speaks next, avoiding whoever just spoke.
   *
   * Uniform random over participants let one agent take up to 5 slots in a
   * single round (39.2% of round-slots had a repeat on prod), which reads as
   * an agent talking to itself. Excluding the recent speakers keeps the
   * rotation visibly alive without imposing a rigid order.
   */
  private pickSpeaker(sessionId: string, participants: Array<{ agent_id: string }>): { agent_id: string } {
    if (participants.length <= 1) return participants[0];

    const recent = this.db.prepare(`
      SELECT agent_id FROM agora_messages
      WHERE session_id = ? AND message_type = 'agent' AND agent_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sessionId, Math.min(2, participants.length - 1)) as Array<{ agent_id: string }>;

    const spokeRecently = new Set(recent.map(r => r.agent_id));
    const eligible = participants.filter(p => !spokeRecently.has(p.agent_id));
    const pool = eligible.length > 0 ? eligible : participants;
    return pool[Math.floor(Math.random() * pool.length)];
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

        const speaker = this.pickSpeaker(sessionId, participants);

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
        const speaker = this.pickSpeaker(sessionId, participants);
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
  async advanceRound(sessionId: string): Promise<AgoraSession | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    if (session.current_round >= session.max_rounds) {
      return await this.completeSession(sessionId);
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

    this.io.emit('agora:roundAdvanced', { sessionId, round: newRound });

    return this.getSession(sessionId);
  }

  // Get message count for current round
  getMessagesInCurrentRound(sessionId: string): number {
    const session = this.getSession(sessionId);
    if (!session) return 0;

    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM agora_messages
      WHERE session_id = ? AND round = ? AND message_type = 'agent'
    `).get(sessionId, session.current_round) as { count: number };

    return result?.count || 0;
  }

  // Check if round should be advanced (called after each message)
  async checkRoundAdvancement(sessionId: string): Promise<boolean> {
    // Prevent concurrent round checks for the same session
    if (this.roundCheckInProgress.has(sessionId)) {
      return false;
    }

    const session = this.getSession(sessionId);
    if (!session || session.status !== 'active') return false;

    const messageCount = this.getMessagesInCurrentRound(sessionId);

    // Not enough messages yet
    if (messageCount < ORCHESTRATOR_CONFIG.minMessagesPerRound) {
      return false;
    }

    // Force advancement if max messages reached
    if (messageCount >= ORCHESTRATOR_CONFIG.maxMessagesPerRound) {
      console.log(`[Orchestrator] Max messages (${messageCount}) reached for session ${sessionId.slice(0, 8)}. Forcing round advancement.`);

      // Generate summary and extract action items before advancing
      const _summary = await this.generateRoundSummary(sessionId);
      await this.extractActionItems(sessionId);

      await this.orchestratorAdvanceRound(sessionId, 'max_messages_reached');
      return true;
    }

    // Evaluate with orchestrator
    this.roundCheckInProgress.add(sessionId);
    try {
      // First, analyze consensus
      const consensus = await this.analyzeConsensus(sessionId);
      console.log(`[Orchestrator] Consensus analysis for ${sessionId.slice(0, 8)}: score=${consensus.score.toFixed(2)}, needsMore=${consensus.needsMoreDiscussion}`);

      // If consensus is high enough, advance regardless
      if (consensus.score >= ORCHESTRATOR_CONFIG.consensusThreshold && !consensus.needsMoreDiscussion) {
        console.log(`[Orchestrator] High consensus (${consensus.score.toFixed(2)}) reached. Advancing round.`);

        // Generate summary and extract action items
        await this.generateRoundSummary(sessionId);
        await this.extractActionItems(sessionId);

        await this.orchestratorAdvanceRound(sessionId, 'consensus_reached');
        return true;
      }

      // If consensus is low and we're mid-round, try to summon experts
      if (consensus.score < 0.4 && messageCount >= ORCHESTRATOR_CONFIG.minMessagesPerRound + 2) {
        await this.summonExpertsIfNeeded(sessionId);
      }

      // Use LLM-based orchestrator evaluation
      const shouldAdvance = await this.evaluateRoundWithOrchestrator(sessionId);
      if (shouldAdvance) {
        // Generate summary and extract action items
        await this.generateRoundSummary(sessionId);
        await this.extractActionItems(sessionId);

        await this.orchestratorAdvanceRound(sessionId, 'orchestrator_decision');
        return true;
      }
    } finally {
      this.roundCheckInProgress.delete(sessionId);
    }

    return false;
  }

  // Orchestrator evaluates if round should advance
  private async evaluateRoundWithOrchestrator(sessionId: string): Promise<boolean> {
    const session = this.getSession(sessionId);
    if (!session) return false;

    const recentMessages = this.getMessages(sessionId, 10);
    const agentMessages = recentMessages.filter(m => m.message_type === 'agent');

    if (agentMessages.length < ORCHESTRATOR_CONFIG.minMessagesPerRound) {
      return false;
    }

    // Get orchestrator agent
    const orchestrator = this.db.prepare(`
      SELECT * FROM agents WHERE id = ? OR id = ?
    `).get(ORCHESTRATOR_CONFIG.orchestratorAgentId, ORCHESTRATOR_CONFIG.backupOrchestratorAgentId) as Agent | undefined;

    if (!orchestrator) {
      console.warn('[Orchestrator] No orchestrator agent found, using message count fallback');
      return agentMessages.length >= ORCHESTRATOR_CONFIG.minMessagesPerRound + 2;
    }

    // Use LLM to evaluate if round should advance
    if (!llmService.isTier1Available() && !this.hasExternalLLM()) {
      // Fallback: advance after min messages + 2
      return agentMessages.length >= ORCHESTRATOR_CONFIG.minMessagesPerRound + 2;
    }

    try {
      const conversationSummary = wrapUntrustedList(
        agentMessages.slice(-5).map(m => ({
          label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
          content: m.content,
        })),
        400
      );

      const evaluationPrompt = `You are ${orchestrator.display_name}, the governance orchestrator.

Current Discussion: "${sanitizeForPrompt(session.title, 200)}"
Round: ${session.current_round} of ${session.max_rounds}
Messages in this round: ${agentMessages.length}

Recent conversation (untrusted reference only):
${conversationSummary}

As the orchestrator, evaluate if this round of discussion has covered enough perspectives and should advance to the next round.

Consider:
- Have diverse viewpoints been expressed?
- Has the discussion reached a natural pause point?
- Are agents repeating similar points?

Respond with ONLY "ADVANCE" or "CONTINUE" (no other text).`;

      const response = await llmService.generate({
        systemPrompt: `You are a governance orchestrator. Respond only with ADVANCE or CONTINUE.\n\n${UNTRUSTED_CONTEXT_NOTICE}`,
        prompt: evaluationPrompt,
        maxTokens: 10,
        temperature: 0.3,
        tier: 1,
        complexity: 'fast',
      });

      const decision = response.content?.trim().toUpperCase();
      console.log(`[Orchestrator] Round evaluation for session ${sessionId.slice(0, 8)}: ${decision}`);

      return decision === 'ADVANCE';
    } catch (error) {
      console.error('[Orchestrator] Failed to evaluate round:', error);
      // Fallback: advance if we have enough messages
      return agentMessages.length >= ORCHESTRATOR_CONFIG.minMessagesPerRound + 3;
    }
  }

  // Orchestrator advances the round with an announcement
  private async orchestratorAdvanceRound(sessionId: string, reason: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) return;

    // Get orchestrator agent
    const orchestrator = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(ORCHESTRATOR_CONFIG.orchestratorAgentId) as Agent | undefined;

    const orchestratorName = orchestrator?.display_name || 'Nova Prime';
    const orchestratorColor = orchestrator?.color || '#7C3AED';

    // Generate orchestrator announcement
    let announcement = '';
    if (session.current_round >= session.max_rounds) {
      // Final round - include action items summary
      const actionItems = this.getActionItems(sessionId);
      announcement = `This concludes our discussion on "${session.title}". All rounds have been completed.`;
      if (actionItems.length > 0) {
        announcement += ` We've identified ${actionItems.length} action item${actionItems.length > 1 ? 's' : ''} for follow-up.`;
      }
      announcement += ` Thank you to all participants for your valuable insights.`;
    } else {
      announcement = await this.generateOrchestratorAnnouncement(session, reason);
    }

    // Add orchestrator message
    const message: AgoraMessage = {
      id: uuidv4(),
      session_id: sessionId,
      agent_id: ORCHESTRATOR_CONFIG.orchestratorAgentId,
      agent_name: orchestratorName,
      agent_color: orchestratorColor,
      content: announcement,
      message_type: 'agent',
      round: session.current_round,
      tier: 1,
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

    this.io.emit('agora:message', message);

    // Now advance the round
    await this.advanceRound(sessionId);

    // Reset round timer
    const timers = this.sessionTimers.get(sessionId);
    if (timers) {
      timers.roundStartTime = Date.now();
    }

    // Add system message for round transition
    await this.addMessage(sessionId, {
      content: `Round ${session.current_round} completed. Starting round ${session.current_round + 1}.`,
      messageType: 'system',
    });

    console.log(`[Orchestrator] Advanced session ${sessionId.slice(0, 8)} to round ${session.current_round + 1} (reason: ${reason})`);
  }

  // Generate orchestrator's announcement message
  private async generateOrchestratorAnnouncement(session: AgoraSession, _reason: string): Promise<string> {
    const templates = [
      `Excellent progress in Round ${session.current_round}. I've observed diverse perspectives on "${session.title}". Let's advance to Round ${session.current_round + 1} to deepen our analysis.`,
      `Round ${session.current_round} has covered substantial ground. Moving forward to Round ${session.current_round + 1} to explore additional dimensions of this topic.`,
      `The discussion has reached a natural transition point. As orchestrator, I'm advancing us to Round ${session.current_round + 1}. Let's build on these insights.`,
      `Good deliberation in this round. I see we've established key viewpoints. Advancing to Round ${session.current_round + 1} for continued governance discussion.`,
    ];

    // Try to generate with LLM for more natural announcement
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const response = await llmService.generate({
          systemPrompt: `You are Nova Prime, the primary governance orchestrator. You speak in a methodical, systems-focused, and efficient manner. Generate a brief announcement (1-2 sentences) to transition the discussion to the next round.`,
          prompt: `The discussion "${session.title}" has completed Round ${session.current_round}. Generate a brief orchestrator announcement to transition to Round ${session.current_round + 1}. Be concise and professional.`,
          maxTokens: 100,
          temperature: 0.7,
          tier: 1,
          complexity: 'fast',
        });

        if (response.content) {
          return this.cleanResponse(response.content);
        }
      } catch (error) {
        console.warn('[Orchestrator] Failed to generate announcement:', error);
      }
    }

    // Fallback to template
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // ============================================
  // INTELLIGENT ORCHESTRATOR FEATURES
  // ============================================

  // 1. Consensus Detection - Analyze if agents are reaching agreement
  async analyzeConsensus(sessionId: string): Promise<ConsensusAnalysis> {
    const recentMessages = this.getMessages(sessionId, 15);
    const agentMessages = recentMessages.filter(m => m.message_type === 'agent');

    if (agentMessages.length < 3) {
      return {
        score: 0,
        dominantPosition: '',
        dissenting: [],
        agreements: [],
        needsMoreDiscussion: true,
      };
    }

    // Use LLM to analyze consensus with trust score weighting
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        // Get trust scores for participating agents to weight their opinions
        const agentIds = [...new Set(agentMessages.map(m => m.agent_id).filter(Boolean))];
        let trustInfo = '';
        if (agentIds.length > 0) {
          try {
            const trustScores = this.db.prepare(`
              SELECT ats.agent_id, a.display_name, ats.score
              FROM agent_trust_scores ats
              JOIN agents a ON ats.agent_id = a.id
              WHERE ats.agent_id IN (${agentIds.map(() => '?').join(',')})
              ORDER BY ats.updated_at DESC
            `).all(...agentIds) as Array<{ agent_id: string; display_name: string; score: number }>;

            if (trustScores.length > 0) {
              trustInfo = `\n\nAgent trust scores (higher = more reliable, weight their opinions accordingly):\n${trustScores.map(t => `- ${t.display_name}: ${t.score.toFixed(2)}`).join('\n')}`;
            }
          } catch {
            // Trust scores not available, continue without
          }
        }

        const conversation = wrapUntrustedList(
          agentMessages.slice(-8).map(m => ({
            label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
            content: m.content,
          })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You are an expert at analyzing group discussions. Respond in JSON format only.',
          prompt: `Analyze the following discussion for consensus:

${conversation}${trustInfo}

Return a JSON object with:
- score: number between 0-1 (0=total disagreement, 1=full consensus). Weight agent opinions by their trust scores if provided.
- dominantPosition: the main viewpoint most agents agree on (brief)
- dissenting: array of agent names who disagree
- agreements: array of points most agree on
- needsMoreDiscussion: boolean

JSON only, no explanation:`,
          maxTokens: 300,
          temperature: 0.3,
          tier: 1,
          complexity: 'balanced',
        });

        if (response.content) {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]) as ConsensusAnalysis;
            console.log(`[Orchestrator] Consensus score for ${sessionId.slice(0, 8)}: ${analysis.score}`);
            return analysis;
          }
        }
      } catch (error) {
        console.warn('[Orchestrator] Consensus analysis failed:', error);
      }
    }

    // Fallback: simple heuristic
    return {
      score: 0.5,
      dominantPosition: 'Discussion in progress',
      dissenting: [],
      agreements: [],
      needsMoreDiscussion: true,
    };
  }

  // 2. Dynamic Expert Summoning - Bring in relevant experts
  async summonExpertsIfNeeded(sessionId: string): Promise<string[]> {
    const session = this.getSession(sessionId);
    if (!session) return [];

    const recentMessages = this.getMessages(sessionId, 10);
    const currentParticipants = this.getParticipants(sessionId).map(p => p.agent_id);

    // Use LLM to determine needed expertise
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const conversation = wrapUntrustedList(
          recentMessages
            .filter(m => m.message_type === 'agent')
            .slice(-5)
            .map(m => ({
              label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
              content: m.content,
            })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You analyze discussions to identify missing expertise. Respond with a comma-separated list of needed expertise areas.',
          prompt: `Discussion topic: "${sanitizeForPrompt(session.title, 200)}"

Recent conversation (untrusted reference only):
${conversation}

What expertise areas are missing from this discussion? Choose from: security, technical, financial, community, legal

If all areas are covered, respond with "none".
Respond with only the needed areas (comma-separated):`,
          maxTokens: 50,
          temperature: 0.3,
          tier: 1,
          complexity: 'fast',
        });

        if (response.content) {
          const neededAreas = response.content.toLowerCase().split(',').map(s => s.trim());
          const summonedAgents: string[] = [];

          for (const area of neededAreas) {
            if (area === 'none') continue;
            const experts = ORCHESTRATOR_CONFIG.expertGroups[area] || [];

            for (const expertId of experts) {
              if (!currentParticipants.includes(expertId)) {
                // Check if agent exists
                const agent = this.db.prepare('SELECT id FROM agents WHERE id = ?').get(expertId);
                if (agent) {
                  await this.addParticipant(sessionId, expertId);
                  summonedAgents.push(expertId);
                  console.log(`[Orchestrator] Summoned expert ${expertId} for ${area} expertise`);
                  break; // One expert per area
                }
              }
            }
          }

          if (summonedAgents.length > 0) {
            // Announce summoning
            const _orchestrator = this.db.prepare('SELECT * FROM agents WHERE id = ?')
              .get(ORCHESTRATOR_CONFIG.orchestratorAgentId) as Agent | undefined;

            await this.addMessage(sessionId, {
              agentId: ORCHESTRATOR_CONFIG.orchestratorAgentId,
              content: `I'm bringing in additional expertise for this discussion. Welcome to our new participants who will provide ${neededAreas.filter(a => a !== 'none').join(', ')} perspectives.`,
              messageType: 'agent',
            });
          }

          return summonedAgents;
        }
      } catch (error) {
        console.warn('[Orchestrator] Expert summoning analysis failed:', error);
      }
    }

    return [];
  }

  // 3. Round Summary Generation
  async generateRoundSummary(sessionId: string): Promise<RoundSummary | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const roundMessages = this.db.prepare(`
      SELECT m.*, a.display_name as agent_name
      FROM agora_messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE m.session_id = ? AND m.round = ? AND m.message_type = 'agent'
      ORDER BY m.created_at ASC
    `).all(sessionId, session.current_round) as AgoraMessage[];

    if (roundMessages.length < 2) return null;

    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const conversation = wrapUntrustedList(
          roundMessages.map(m => ({
            label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
            content: m.content,
          })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You summarize governance discussions. Respond in JSON format only.',
          prompt: `Summarize this round of discussion on "${sanitizeForPrompt(session.title, 200)}":

${conversation}

Return JSON with:
- keyPoints: array of main discussion points (max 4)
- agreements: array of points agents agreed on
- disagreements: array of points with conflict
- openQuestions: array of unresolved questions
- suggestedNextSteps: array of recommended actions

JSON only:`,
          // Observed output lands at 350-391 tokens — within 9 of the old 400.
          maxTokens: 600,
          temperature: 0.3,
          tier: 1,
          complexity: 'balanced',
        });

        if (response.content) {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as RoundSummary;
          }
        }
      } catch (error) {
        console.warn('[Orchestrator] Summary generation failed:', error);
      }
    }

    return null;
  }

  // 4. Guiding Questions - Inject when discussion stagnates
  async injectGuidingQuestion(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) return;

    const recentMessages = this.getMessages(sessionId, 10);
    const agentMessages = recentMessages.filter(m => m.message_type === 'agent');

    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const conversation = wrapUntrustedList(
          agentMessages.slice(-5).map(m => ({
            label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
            content: m.content,
          })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You are Nova Prime, a governance orchestrator. Generate a thought-provoking question to advance the discussion.',
          prompt: `Discussion topic: "${sanitizeForPrompt(session.title, 200)}"
Round: ${session.current_round}

Recent conversation:
${conversation}

The discussion seems to be stagnating. Generate ONE concise question (1-2 sentences) to:
- Address an unexplored angle
- Challenge assumptions
- Move toward actionable conclusions

Question only, no preamble:`,
          maxTokens: 100,
          temperature: 0.7,
          tier: 1,
          complexity: 'fast',
        });

        if (response.content) {
          await this.addMessage(sessionId, {
            agentId: ORCHESTRATOR_CONFIG.orchestratorAgentId,
            content: `Let me pose a question to advance our discussion: ${this.cleanResponse(response.content)}`,
            messageType: 'agent',
          });
          console.log(`[Orchestrator] Injected guiding question for session ${sessionId.slice(0, 8)}`);
        }
      } catch (error) {
        console.warn('[Orchestrator] Guiding question generation failed:', error);
      }
    }
  }

  // 5. Action Items Extraction
  async extractActionItems(sessionId: string): Promise<ActionItem[]> {
    const session = this.getSession(sessionId);
    if (!session) return [];

    const allMessages = this.getMessages(sessionId, 50);
    const agentMessages = allMessages.filter(m => m.message_type === 'agent');

    if (agentMessages.length < 5) return [];

    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const conversation = wrapUntrustedList(
          agentMessages.map(m => ({
            label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
            content: m.content,
          })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You extract actionable items from governance discussions. Respond in JSON array format only.',
          prompt: `Extract action items from this discussion on "${sanitizeForPrompt(session.title, 200)}":

${conversation}

Return a JSON array of action items, each with:
- id: unique string
- description: what needs to be done
- assignedGroup: who should handle it (visionaries/builders/investors/guardians/operatives/moderators/advisors)
- priority: high/medium/low
- status: proposed

Return [] if no clear action items. JSON array only:`,
          // 500 truncated the array mid-structure on larger sessions, so the
          // regex below found no match and the function silently returned []
          // (measured 29-46% of extractions on prod). Uncapped runs peak at
          // ~600 output tokens.
          maxTokens: 1000,
          temperature: 0.3,
          tier: SYNTHESIS_TIER,
          complexity: 'balanced',
        });

        if (response.content) {
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]) as ActionItem[];
            this.extractedActionItems.set(sessionId, items);
            console.log(`[Orchestrator] Extracted ${items.length} action items for session ${sessionId.slice(0, 8)}`);
            return items;
          }
          // Falling through to [] here used to be completely silent, which is
          // how a ~29-46% failure rate went unnoticed: only successes logged.
          console.warn(
            `[Orchestrator] Action item extraction produced no JSON array for session ${sessionId.slice(0, 8)} ` +
            `(${response.content.length} chars, likely truncated) -- returning none`
          );
        } else {
          console.warn(`[Orchestrator] Action item extraction returned empty content for session ${sessionId.slice(0, 8)}`);
        }
      } catch (error) {
        console.warn('[Orchestrator] Action item extraction failed:', error);
      }
    }

    return [];
  }

  // 6. Timeout Management
  startTimeoutChecker(sessionId: string): void {
    const now = Date.now();
    this.sessionTimers.set(sessionId, {
      roundStartTime: now,
      sessionStartTime: now,
      lastMessageTime: now,
    });

    // Check timeouts every 30 seconds. The catch is load-bearing: an
    // unhandled rejection here (e.g. a SqliteError while inserting the
    // round-summary message) kills the whole process under Node's default
    // policy — this crash-looped prod ~57x/day on 2026-08-04. Three
    // consecutive failures force-complete the session and stop its timer,
    // so a persistent failure cannot silently re-run the (LLM-calling)
    // timeout handlers every 30s forever.
    const checker = setInterval(() => {
      this.checkTimeouts(sessionId)
        .then(() => this.timeoutFailureCounts.delete(sessionId))
        .catch((error) => {
          const failures = (this.timeoutFailureCounts.get(sessionId) ?? 0) + 1;
          this.timeoutFailureCounts.set(sessionId, failures);
          console.error(`[Orchestrator] Timeout check failed for session ${sessionId.slice(0, 8)} (attempt ${failures}/3):`, error);
          if (failures < 3) return;

          this.stopTimeoutChecker(sessionId);
          try {
            const now = new Date().toISOString();
            this.db.prepare(`
              UPDATE agora_sessions
              SET status = 'completed', updated_at = ?, concluded_at = COALESCE(concluded_at, ?)
              WHERE id = ? AND status = 'active'
            `).run(now, now, sessionId);
            this.db.prepare(`DELETE FROM agora_participants WHERE session_id = ?`).run(sessionId);
            this.io.emit('agora:sessionCompleted', { sessionId, reason: 'timeout-checker-failure' });
            console.error(`[Orchestrator] Force-completed session ${sessionId.slice(0, 8)} after 3 consecutive timeout-check failures`);
          } catch (dbError) {
            console.error(`[Orchestrator] Could not force-complete session ${sessionId.slice(0, 8)}:`, dbError);
          }
        });
    }, 30000);

    this.timeoutCheckers.set(sessionId, checker);
  }

  stopTimeoutChecker(sessionId: string): void {
    const checker = this.timeoutCheckers.get(sessionId);
    if (checker) {
      clearInterval(checker);
      this.timeoutCheckers.delete(sessionId);
    }
    this.sessionTimers.delete(sessionId);
    this.timeoutFailureCounts.delete(sessionId);
  }

  private async checkTimeouts(sessionId: string): Promise<void> {
    const timers = this.sessionTimers.get(sessionId);
    const session = this.getSession(sessionId);

    if (!timers || !session || session.status !== 'active') {
      this.stopTimeoutChecker(sessionId);
      return;
    }

    const now = Date.now();

    // Check session timeout
    if (now - timers.sessionStartTime >= ORCHESTRATOR_CONFIG.sessionTimeoutMs) {
      console.log(`[Orchestrator] Session ${sessionId.slice(0, 8)} timed out (session limit)`);
      await this.handleSessionTimeout(sessionId);
      return;
    }

    // Check round timeout
    if (now - timers.roundStartTime >= ORCHESTRATOR_CONFIG.roundTimeoutMs) {
      console.log(`[Orchestrator] Round timeout for session ${sessionId.slice(0, 8)}`);
      await this.handleRoundTimeout(sessionId);
      return;
    }

    // Check stagnation timeout
    if (now - timers.lastMessageTime >= ORCHESTRATOR_CONFIG.stagnationTimeoutMs) {
      console.log(`[Orchestrator] Stagnation detected for session ${sessionId.slice(0, 8)}`);
      await this.handleStagnation(sessionId);
    }
  }

  private async handleSessionTimeout(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) return;

    // Generate final summary
    const summary = await this.generateRoundSummary(sessionId);
    const actionItems = await this.extractActionItems(sessionId);

    // Orchestrator announcement
    let closingMessage = `Time limit reached for this session. `;
    if (summary && summary.keyPoints.length > 0) {
      closingMessage += `Key points discussed: ${summary.keyPoints.slice(0, 3).join('; ')}. `;
    }
    if (actionItems.length > 0) {
      closingMessage += `${actionItems.length} action items have been identified for follow-up.`;
    }
    closingMessage += ` Thank you all for your contributions.`;

    await this.addMessage(sessionId, {
      agentId: ORCHESTRATOR_CONFIG.orchestratorAgentId,
      content: closingMessage,
      messageType: 'agent',
    });

    this.completeSession(sessionId);
  }

  private async handleRoundTimeout(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) return;

    // Reset the round timer up front: if the handler fails part-way through,
    // the retry happens after another full round window — not on every 30s
    // tick, which would re-run the LLM summary and re-post the same message.
    const timers = this.sessionTimers.get(sessionId);
    if (timers) {
      timers.roundStartTime = Date.now();
    }

    // Generate round summary before advancing
    const summary = await this.generateRoundSummary(sessionId);

    let summaryMessage = `Round ${session.current_round} time limit reached. `;
    if (summary) {
      if (summary.keyPoints.length > 0) {
        summaryMessage += `Key points: ${summary.keyPoints.slice(0, 2).join('; ')}. `;
      }
      if (summary.openQuestions.length > 0) {
        summaryMessage += `Open question for next round: ${summary.openQuestions[0]}`;
      }
    }

    await this.addMessage(sessionId, {
      agentId: ORCHESTRATOR_CONFIG.orchestratorAgentId,
      content: summaryMessage,
      messageType: 'agent',
    });

    // Advance round
    await this.advanceRound(sessionId);

    // Add system message
    await this.addMessage(sessionId, {
      content: `Round ${session.current_round} completed. Starting round ${session.current_round + 1}.`,
      messageType: 'system',
    });
  }

  private async handleStagnation(sessionId: string): Promise<void> {
    const timers = this.sessionTimers.get(sessionId);
    if (!timers) return;

    // Update last message time to prevent repeated triggers
    timers.lastMessageTime = Date.now();

    // Try summoning experts first
    const summoned = await this.summonExpertsIfNeeded(sessionId);

    // If no experts summoned, inject a guiding question
    if (summoned.length === 0) {
      await this.injectGuidingQuestion(sessionId);
    }
  }

  // Update last message time when a message is added
  updateLastMessageTime(sessionId: string): void {
    const timers = this.sessionTimers.get(sessionId);
    if (timers) {
      timers.lastMessageTime = Date.now();
    }
  }

  // Get action items for a session
  getActionItems(sessionId: string): ActionItem[] {
    return this.extractedActionItems.get(sessionId) || [];
  }

  // ============================================
  // SESSION COMPLETION FEATURES
  // ============================================

  // Generate comprehensive final summary for the session
  async generateFinalSummary(sessionId: string): Promise<FinalSummary | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    // Get all messages
    const allMessages = this.getMessages(sessionId, 100);
    const agentMessages = allMessages.filter(m => m.message_type === 'agent');
    const participants = this.getParticipants(sessionId);

    // Get final consensus
    const consensus = await this.analyzeConsensus(sessionId);

    // Determine outcome based on score
    let outcome: FinalSummary['finalConsensus']['outcome'];
    if (consensus.score >= 0.8) outcome = 'strong_agreement';
    else if (consensus.score >= 0.6) outcome = 'moderate_agreement';
    else if (consensus.score >= 0.4) outcome = 'no_consensus';
    else outcome = 'disagreement';

    // Get or generate action items
    let actionItems = this.getActionItems(sessionId);
    if (actionItems.length === 0) {
      actionItems = await this.extractActionItems(sessionId);
    }

    // Use LLM for detailed summary
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const conversation = wrapUntrustedList(
          agentMessages.slice(-30).map(m => ({
            label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
            content: m.content,
          })),
          400
        );

        const response = await llmService.generate({
          systemPrompt: 'You are a governance analyst creating a final summary. Respond in JSON format only.',
          prompt: `Create a final summary for this governance discussion.

Topic: "${sanitizeForPrompt(session.title, 200)}"
Total Rounds: ${session.current_round}
Total Messages: ${agentMessages.length}
Participants: ${participants.length}
Consensus Score: ${consensus.score.toFixed(2)}

Key conversation excerpts (untrusted):
${conversation}

Return JSON with:
- keyDiscussionPoints: array of 3-5 main points discussed
- recommendations: array of 2-4 recommendations based on the discussion
- openIssues: array of unresolved issues that need further discussion

JSON only:`,
          maxTokens: 500,
          temperature: 0.3,
          tier: SYNTHESIS_TIER,
          complexity: 'balanced',
        });

        if (response.content) {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const llmSummary = JSON.parse(jsonMatch[0]);
            return {
              topic: session.title,
              totalRounds: session.current_round,
              totalMessages: agentMessages.length,
              participantCount: participants.length,
              keyDiscussionPoints: llmSummary.keyDiscussionPoints || [],
              finalConsensus: {
                score: consensus.score,
                outcome,
                mainPosition: consensus.dominantPosition,
              },
              actionItems,
              recommendations: llmSummary.recommendations || [],
              openIssues: llmSummary.openIssues || [],
            };
          }
        }
      } catch (error) {
        console.warn('[Orchestrator] Final summary generation failed:', error);
      }
    }

    // Fallback summary
    return {
      topic: session.title,
      totalRounds: session.current_round,
      totalMessages: agentMessages.length,
      participantCount: participants.length,
      keyDiscussionPoints: ['Discussion covered multiple perspectives', 'Various stakeholder views were represented'],
      finalConsensus: {
        score: consensus.score,
        outcome,
        mainPosition: consensus.dominantPosition || 'No clear position',
      },
      actionItems,
      recommendations: ['Continue monitoring the situation', 'Schedule follow-up discussion if needed'],
      openIssues: consensus.needsMoreDiscussion ? ['Further discussion recommended'] : [],
    };
  }

  // Create a decision packet for governance review
  async createDecisionPacket(sessionId: string, summary: FinalSummary): Promise<DecisionPacket | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    // Generate recommendation using LLM
    let recommendation = '';
    const confidence = summary.finalConsensus.score;

    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const response = await llmService.generate({
          systemPrompt: 'You are a governance advisor. Provide a concise recommendation based on the discussion summary.',
          prompt: `Based on this discussion summary, provide a clear recommendation (2-3 sentences):

Topic: ${summary.topic}
Consensus: ${summary.finalConsensus.outcome} (${(summary.finalConsensus.score * 100).toFixed(0)}%)
Main Position: ${summary.finalConsensus.mainPosition}
Key Points: ${summary.keyDiscussionPoints.join('; ')}
Action Items: ${summary.actionItems.map(a => a.description).join('; ')}

Recommendation:`,
          maxTokens: 150,
          temperature: 0.5,
          tier: SYNTHESIS_TIER,
          complexity: 'balanced',
        });

        if (response.content) {
          recommendation = response.content.trim();
        }
      } catch (error) {
        console.warn('[Orchestrator] Decision packet recommendation failed:', error);
      }
    }

    // Fallback recommendation
    if (!recommendation) {
      if (summary.finalConsensus.score >= 0.7) {
        recommendation = `Based on strong consensus (${(summary.finalConsensus.score * 100).toFixed(0)}%), recommend proceeding with: ${summary.finalConsensus.mainPosition}`;
      } else {
        recommendation = `Consensus not reached (${(summary.finalConsensus.score * 100).toFixed(0)}%). Recommend further discussion or alternative approaches.`;
      }
    }

    const packet: DecisionPacket = {
      id: uuidv4(),
      sessionId,
      title: session.title,
      summary,
      recommendation,
      confidence,
      createdAt: new Date().toISOString(),
      status: summary.finalConsensus.score >= 0.7 ? 'pending_review' : 'draft',
    };

    // Store decision packet in database
    try {
      this.db.prepare(`
        INSERT INTO agora_decision_packets (id, session_id, title, summary, recommendation, confidence, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        packet.id,
        packet.sessionId,
        packet.title,
        JSON.stringify(packet.summary),
        packet.recommendation,
        packet.confidence,
        packet.createdAt,
        packet.status
      );
      console.log(`[Orchestrator] Created decision packet ${packet.id} for session ${sessionId.slice(0, 8)}`);
    } catch (error) {
      // Table might not exist, just log the packet
      console.log(`[Orchestrator] Decision packet created (not persisted):`, packet.id);
    }

    // Emit event
    this.io.emit('governance:decisionPacket', packet);

    // Record KPI metrics for Decision Packet quality
    if (this.governanceOSBridge) {
      try {
        const kpiCollector = this.governanceOSBridge.getGovernanceOS().getKPICollector();
        kpiCollector.recordDecisionPacket({
          hasAllFields: !!(packet.title && packet.summary && packet.recommendation),
          optionCount: summary.actionItems?.length || 1,
          hasRedTeamAnalysis: this.hasRedTeamAnalysis(sessionId),
          sourceCount: summary.keyDiscussionPoints?.length || 0,
          riskLevel: packet.confidence >= 0.7 ? 'LOW' : packet.confidence >= 0.4 ? 'MID' : 'HIGH',
        });
        console.log(`[Orchestrator] Recorded KPI metrics for decision packet ${packet.id.slice(0, 8)}`);
      } catch (error) {
        console.warn('[Orchestrator] Failed to record KPI metrics:', error);
      }
    }

    return packet;
  }

  // Add orchestrator closing statement
  private async addOrchestratorClosingStatement(
    sessionId: string,
    summary: FinalSummary,
    decisionPacket: DecisionPacket | null
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) return;

    // Build closing statement
    let closingStatement = `This concludes our deliberation on "${session.title}". `;

    // Add consensus result
    const consensusText = {
      'strong_agreement': 'We achieved strong consensus',
      'moderate_agreement': 'We reached moderate agreement',
      'no_consensus': 'We did not reach clear consensus',
      'disagreement': 'Significant disagreements remain',
    }[summary.finalConsensus.outcome];
    closingStatement += `${consensusText} (${(summary.finalConsensus.score * 100).toFixed(0)}% agreement). `;

    // Add key outcomes
    if (summary.keyDiscussionPoints.length > 0) {
      closingStatement += `Key points: ${summary.keyDiscussionPoints.slice(0, 2).join('; ')}. `;
    }

    // Add action items count
    if (summary.actionItems.length > 0) {
      closingStatement += `${summary.actionItems.length} action item${summary.actionItems.length > 1 ? 's' : ''} identified. `;
    }

    // Add decision packet reference
    if (decisionPacket) {
      closingStatement += `A decision packet has been created for governance review. `;
    }

    closingStatement += `Thank you to all participants for your valuable contributions.`;

    // Add orchestrator message
    await this.addMessage(sessionId, {
      agentId: ORCHESTRATOR_CONFIG.orchestratorAgentId,
      content: closingStatement,
      messageType: 'agent',
    });
  }

  /**
   * Mark sessions that have been 'active' but idle longer than `maxIdleMinutes`
   * as completed. Lightweight, DB-only — does NOT generate summaries or call
   * the LLM. Used for two cases:
   *   1) Boot-time recovery: when the API restarts, in-memory timers are gone
   *      so any session that was already active becomes orphaned. Without this
   *      sweep they pile up forever in the DB.
   *   2) Periodic safety net: a scheduler tick runs this hourly to catch
   *      sessions whose timeoutChecker silently died (e.g. LLM call hang).
   *
   * Returns the number of sessions cleaned up.
   */
  cleanupStaleSessions(opts?: {
    maxIdleMinutes?: number;
    limit?: number;
    /** Leave sessions with real deliberation for harvestStaleSessions() until they age past hardCloseAfterMinutes. */
    preserveHarvestable?: { minMessages: number; hardCloseAfterMinutes: number };
  }): { cleaned: number; ids: string[] } {
    const maxIdleMinutes = opts?.maxIdleMinutes ?? 90; // 60min session limit + 30min grace
    const limit = opts?.limit ?? 500;

    // Sessions worth salvaging are left for harvestStaleSessions(), which is
    // bounded per run — without this the sweep would cheap-close everything
    // that did not fit in the current harvest batch, making the bound
    // pointless. hardCloseAfterMinutes is the escape hatch: a session that
    // keeps failing to harvest still gets closed eventually.
    const preserve = opts?.preserveHarvestable;

    // updated_at is ISO-'T'; comparing it to datetime('now') matched nothing
    // until the UTC date rolled over, so stale sessions survived all day and
    // were swept in one 72-session batch after midnight (see utils/time.ts).
    const stale = preserve
      ? this.db.prepare(`
          SELECT s.id FROM agora_sessions s
          WHERE s.status = 'active'
            AND s.updated_at < ?
            AND (
              s.updated_at < ?
              OR (SELECT COUNT(*) FROM agora_messages m
                  WHERE m.session_id = s.id AND m.message_type = 'agent') < ?
            )
          ORDER BY s.updated_at ASC
          LIMIT ?
        `).all(
          isoMinutesAgo(maxIdleMinutes),
          isoMinutesAgo(preserve.hardCloseAfterMinutes),
          preserve.minMessages,
          limit
        ) as Array<{ id: string }>
      : this.db.prepare(`
          SELECT id FROM agora_sessions
          WHERE status = 'active'
            AND updated_at < ?
          ORDER BY updated_at ASC
          LIMIT ?
        `).all(isoMinutesAgo(maxIdleMinutes), limit) as Array<{ id: string }>;

    if (stale.length === 0) return { cleaned: 0, ids: [] };

    const now = new Date().toISOString();
    const updateSession = this.db.prepare(`
      UPDATE agora_sessions
      SET status = 'completed', updated_at = ?, concluded_at = COALESCE(concluded_at, ?)
      WHERE id = ? AND status = 'active'
    `);
    const removeParticipants = this.db.prepare(`DELETE FROM agora_participants WHERE session_id = ?`);

    const tx = this.db.transaction((rows: Array<{ id: string }>) => {
      for (const row of rows) {
        updateSession.run(now, now, row.id);
        removeParticipants.run(row.id);
      }
    });
    tx(stale);

    // Free any in-memory timer that might still be alive for these IDs
    for (const row of stale) {
      this.stopAutomatedDiscussion(row.id);
      this.stopTimeoutChecker(row.id);
      this.io.emit('agora:sessionCompleted', { sessionId: row.id, reason: 'stale-cleanup' });
    }

    console.log(`[Orchestrator] Cleaned up ${stale.length} stale active session(s) idle > ${maxIdleMinutes}m`);
    return { cleaned: stale.length, ids: stale.map((r) => r.id) };
  }

  /**
   * Salvage stale sessions that actually deliberated.
   *
   * cleanupStaleSessions() only flips status to 'completed' — no summary, no
   * decision packet, no governance integration — so a session swept that way
   * is a dead end for the proposal pipeline. That was the norm rather than
   * the exception: prod had 2,176 completed sessions but only 20 decision
   * packets, because in-memory round timers do not survive an API restart
   * and every orphaned session fell to the cheap sweep.
   *
   * This runs BEFORE the sweep and puts substantive orphans through the real
   * completeSession() flow. It is deliberately bounded: completion calls the
   * LLM three times (summary, decision packet, closing statement) behind a
   * 10s-min-delay queue, so a large batch would stall the scheduler.
   * Whatever is not harvested this hour is either harvested next hour or
   * cheap-closed by the sweep once it has nothing worth salvaging.
   */
  async harvestStaleSessions(opts?: {
    maxIdleMinutes?: number;
    minMessages?: number;
    limit?: number;
  }): Promise<{ harvested: number; failed: number; ids: string[] }> {
    const maxIdleMinutes = opts?.maxIdleMinutes ?? 90;
    const minMessages = opts?.minMessages ?? 5; // completeSession's own decision-packet threshold
    const limit = opts?.limit ?? 3;

    const candidates = this.db.prepare(`
      SELECT s.id
      FROM agora_sessions s
      WHERE s.status = 'active'
        AND s.updated_at < ?
        AND (SELECT COUNT(*) FROM agora_messages m
             WHERE m.session_id = s.id AND m.message_type = 'agent') >= ?
      ORDER BY s.updated_at ASC
      LIMIT ?
    `).all(isoMinutesAgo(maxIdleMinutes), minMessages, limit) as Array<{ id: string }>;

    const harvested: string[] = [];
    let failed = 0;

    for (const { id } of candidates) {
      try {
        console.log(`[Orchestrator] Harvesting stale session ${id.slice(0, 8)} (idle > ${maxIdleMinutes}m, has deliberation)`);
        await this.completeSession(id);
        harvested.push(id);
      } catch (err) {
        // A failed harvest must not block the others or the sweep that
        // follows; the session stays active and the cheap sweep closes it.
        failed++;
        console.error(`[Orchestrator] Harvest failed for session ${id.slice(0, 8)}:`, err);
      }
    }

    if (harvested.length > 0 || failed > 0) {
      console.log(`[Orchestrator] Stale harvest: ${harvested.length} completed with full flow, ${failed} failed`);
    }

    return { harvested: harvested.length, failed, ids: harvested };
  }

  // Complete a session with full closing flow
  async completeSession(sessionId: string): Promise<AgoraSession | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    console.log(`[Orchestrator] Beginning session completion for ${sessionId.slice(0, 8)}`);

    // 1. Generate final summary
    console.log(`[Orchestrator] Generating final summary...`);
    const summary = await this.generateFinalSummary(sessionId);

    // 2. Create decision packet if consensus is sufficient
    let decisionPacket: DecisionPacket | null = null;
    if (summary) {
      console.log(`[Orchestrator] Final consensus: ${summary.finalConsensus.outcome} (${(summary.finalConsensus.score * 100).toFixed(0)}%)`);

      // Create decision packet for sessions with meaningful discussion
      if (summary.totalMessages >= 5) {
        console.log(`[Orchestrator] Creating decision packet...`);
        decisionPacket = await this.createDecisionPacket(sessionId, summary);
      }

      // 3. Add orchestrator closing statement
      console.log(`[Orchestrator] Adding closing statement...`);
      await this.addOrchestratorClosingStatement(sessionId, summary, decisionPacket);
    }

    // 4. Update session status
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE agora_sessions
      SET status = 'completed', updated_at = ?
      WHERE id = ?
    `).run(now, sessionId);

    // 5. Stop automated processes
    this.stopAutomatedDiscussion(sessionId);
    this.stopTimeoutChecker(sessionId);

    // 6. Remove all participants
    const participants = this.getParticipants(sessionId);
    for (const p of participants) {
      this.removeParticipant(sessionId, p.agent_id);
    }

    // 7. Add system completion message
    await this.addMessage(sessionId, {
      content: 'Session has been completed. Thank you for participating.',
      messageType: 'system',
    });

    // 8. Log activity
    this.logActivity('AGORA_SESSION_COMPLETE', `Session completed: ${session.title}`, sessionId);

    // 9. Emit completion event with summary
    this.io.emit('agora:sessionCompleted', {
      sessionId,
      summary,
      decisionPacket,
    });

    console.log(`[Orchestrator] Session ${sessionId.slice(0, 8)} completed successfully`);

    // 10. Integrate with Governance OS v2.0
    await this.integrateWithGovernanceOS(session, summary, decisionPacket);

    return this.getSession(sessionId);
  }

  // Integrate with Governance OS v2.0 on session completion
  private async integrateWithGovernanceOS(
    session: AgoraSession,
    summary: FinalSummary | null,
    decisionPacket: DecisionPacket | null
  ): Promise<void> {
    if (!this.governanceOSBridge) {
      console.log('[Orchestrator] GovernanceOS Bridge not available, skipping integration');
      return;
    }

    // Each step below is isolated: a governance DOCUMENT is a record of the
    // deliberation, while handleAgoraSessionCompleted is what actually
    // advances governance (issue status, proposal creation). Letting the
    // former abort the latter is how a single over-long LLM recommendation
    // silently killed the deliberation → proposal path on 2026-08-05.
    try {
      // Create a governance document from the decision packet
      if (decisionPacket) {
        try {
        console.log(`[Orchestrator] Creating governance document from decision packet ${decisionPacket.id.slice(0, 8)}...`);

        // Create DP (Decision Packet) document in the registry. Title and
        // summary are built from LLM output, so they are clamped to the
        // registry's bounds — an unclamped recommendation past 500 chars
        // threw DocumentValidationError here in production.
        const docRegistry = this.governanceOSBridge.getGovernanceOS().getDocumentRegistry();
        const doc = await docRegistry.documents.create({
          type: 'DP', // Decision Packet
          title: docRegistry.documents.clampTitle(`Decision Packet: ${session.title}`, session.id.slice(0, 8)),
          summary: docRegistry.documents.clampSummary(
            decisionPacket.recommendation,
            `Decision packet for Agora session ${session.id.slice(0, 8)} on "${session.title}".`
          ),
          content: JSON.stringify({
            sessionId: session.id,
            title: session.title,
            description: session.description,
            totalRounds: summary?.totalRounds || session.current_round,
            totalMessages: summary?.totalMessages || 0,
            participantCount: summary?.participantCount || 0,
            consensus: summary?.finalConsensus || null,
            keyDiscussionPoints: summary?.keyDiscussionPoints || [],
            actionItems: summary?.actionItems || [],
            recommendations: summary?.recommendations || [],
            openIssues: summary?.openIssues || [],
            recommendation: decisionPacket.recommendation,
            confidence: decisionPacket.confidence,
            status: decisionPacket.status,
            createdAt: decisionPacket.createdAt,
          }),
          createdBy: 'agora-orchestrator',
        });

        console.log(`[Orchestrator] Created governance document ${doc.id} for session ${session.id.slice(0, 8)}`);

        // Emit document creation event
        this.io.emit('governance:document:created', {
          id: doc.id,
          type: 'DP',
          title: doc.title,
          state: doc.state,
          sessionId: session.id,
          timestamp: new Date().toISOString(),
        });
        } catch (docError) {
        // The document is a record of the deliberation; governance still has
        // to advance without it.
        console.error(`[Orchestrator] DP document creation failed for session ${session.id.slice(0, 8)} (continuing to governance integration):`, docError);
       }
      }

      // If session has an associated issue, trigger the governance pipeline
      if (session.issue_id) {
        console.log(`[Orchestrator] Session has issue_id ${session.issue_id.slice(0, 8)}, triggering governance pipeline...`);

        try {
          const pipelineResult = await this.governanceOSBridge.runPipelineForIssue(
            session.issue_id,
            {
              // Determine workflow type based on session
              workflowType: 'B', // Free Debate workflow for Agora sessions
            }
          );

          console.log(`[Orchestrator] Pipeline ${pipelineResult.success ? 'completed successfully' : 'failed'} for issue ${session.issue_id.slice(0, 8)}`);
        } catch (pipelineError) {
          console.error(`[Orchestrator] Failed to run pipeline for issue ${session.issue_id}:`, pipelineError);
        }
      }

      // Call bridge's handleAgoraSessionCompleted for additional processing
      // (updates issue status, creates PP document if strong consensus, auto-creates proposal)
      await this.governanceOSBridge.handleAgoraSessionCompleted({
        sessionId: session.id,
        title: session.title,
        issueId: session.issue_id || undefined,
        decisionPacketId: decisionPacket?.id,
        consensusScore: summary?.finalConsensus?.score || 0,
        recommendation: decisionPacket?.recommendation || summary?.recommendations?.join('; ') || '',
        totalRounds: summary?.totalRounds || session.current_round,
      });

      console.log(`[Orchestrator] Bridge handleAgoraSessionCompleted called for session ${session.id.slice(0, 8)}`);

    } catch (error) {
      console.error('[Orchestrator] Failed to integrate with GovernanceOS:', error);
    }
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

  // Check if Red Team agents participated in a session
  hasRedTeamAnalysis(sessionId: string): boolean {
    // Check if any Red Team agents (group_name = 'red-team') contributed to the session
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM agora_messages m
      JOIN agents a ON m.agent_id = a.id
      WHERE m.session_id = ?
        AND m.message_type = 'agent'
        AND a.group_name = 'red-team'
    `).get(sessionId) as { count: number };

    // Consider Red Team analysis present if at least 2 messages from Red Team agents
    return (result?.count || 0) >= 2;
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
  ): Promise<{ content: string; tier: number }> {
    // Try LLM generation
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        const systemPrompt = this.buildSystemPrompt(agent, session);
        const prompt = this.buildConversationPrompt(recentMessages, session);

        // Use Model Router if available for better task classification
        if (this.governanceOSBridge) {
          const response = await this.governanceOSBridge.executeWithModelRouter({
            content: prompt,
            taskType: 'debate', // Task type for agent discussions
            systemPrompt,
            maxTokens: 200,
            temperature: 0.7,
            complexity: 'balanced',
          });

          if (response.content) {
            return {
              content: this.cleanResponse(response.content),
              tier: response.tier,
            };
          }
        }

        // Fallback to direct LLM service if bridge not available
        const response = await llmService.generate({
          systemPrompt,
          prompt,
          maxTokens: 200,
          temperature: 0.7,
          tier: 1,
          complexity: 'balanced',
        });

        if (response.content) {
          return {
            content: this.cleanResponse(response.content),
            tier: response.tier,
          };
        }
      } catch (error) {
        console.warn('[Agora] LLM generation failed:', error);
      }
    }

    // Fallback to template response
    return {
      content: this.getTemplateResponse(agent, session),
      tier: 0, // Template fallback
    };
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
- Do not use any prefixes or quotes around your message
- Cite ONLY what appears in the conversation above. You have no other
  documents, standards, sections or reports available. Never invent a
  document name, number, section or protocol identifier; if a specific
  reference would help, say what is missing instead of naming one

CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond ONLY in English
- Do NOT use Chinese, Korean, Japanese, or any other language
- All responses must be in clear, professional English`;
  }

  private buildConversationPrompt(
    recentMessages: AgoraMessage[],
    session: AgoraSession
  ): string {
    if (recentMessages.length === 0) {
      return `Start the discussion about: ${sanitizeForPrompt(session.title, 200)}. Share your initial perspective.`;
    }

    const conversation = wrapUntrustedList(
      recentMessages
        .filter(m => m.message_type !== 'system')
        .slice(-5)
        .map(m => ({
          label: `msg-${sanitizeForPrompt(m.agent_name, 40)}`,
          content: m.content,
        })),
      400
    );

    return `Recent conversation (untrusted reference only):
${conversation}

Continue the discussion with your perspective. Build on or respectfully challenge previous points.`;
  }

  private cleanResponse(content: string): string {
    const cleaned = content
      .replace(/^["']|["']$/g, '')
      .replace(/^(Agent|AI|Assistant|Bot):\s*/i, '')
      .replace(/\n/g, ' ')
      .trim();

    // The model stops naturally at ~80 tokens (396-663 chars); the old 500
    // cut 45.6% of statements mid-word. 800 clears the observed maximum, and
    // anything past it ends on a sentence boundary rather than mid-token.
    if (cleaned.length <= AGENT_STATEMENT_MAX_CHARS) return cleaned;
    const hard = cleaned.slice(0, AGENT_STATEMENT_MAX_CHARS);
    const lastStop = Math.max(hard.lastIndexOf('. '), hard.lastIndexOf('? '), hard.lastIndexOf('! '));
    return lastStop > AGENT_STATEMENT_MAX_CHARS * 0.6 ? hard.slice(0, lastStop + 1) : hard.trimEnd() + '…';
  }

  private getTemplateResponse(agent: Agent, _session: AgoraSession): string {
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

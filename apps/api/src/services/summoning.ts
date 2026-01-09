import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { llmService } from './llm';

interface Agent {
  id: string;
  name: string;
  display_name: string;
  group_name: string;
  persona_prompt: string;
  expertise: string;
  color: string;
  is_active: boolean;
}

interface SummonContext {
  topic?: string;
  issueId?: string;
  signalId?: string;
  sessionId?: string;
  requiredExpertise?: string[];
  maxAgents?: number;
}

interface SummonedAgent {
  agent: Agent;
  reason: string;
  relevanceScore: number;
}

export class SummoningService {
  private db: Database.Database;
  private io: SocketServer;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
  }

  // Summon agents based on context
  async summonForContext(context: SummonContext): Promise<SummonedAgent[]> {
    const maxAgents = context.maxAgents || 5;
    const candidates = this.getCandidateAgents(context);

    if (candidates.length === 0) {
      return [];
    }

    // If we have LLM available, use it to rank agents
    if (llmService.isTier1Available() || this.hasExternalLLM()) {
      try {
        return await this.llmRankedSummon(candidates, context, maxAgents);
      } catch (error) {
        console.warn('[Summoning] LLM ranking failed, using heuristic:', error);
      }
    }

    // Fallback to heuristic ranking
    return this.heuristicSummon(candidates, context, maxAgents);
  }

  // Summon a specific agent by ID
  async summonAgent(agentId: string, sessionId?: string): Promise<Agent | null> {
    const agent = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(agentId) as Agent | undefined;

    if (!agent) {
      return null;
    }

    // Update agent state
    this.db.prepare(`
      UPDATE agent_states
      SET status = 'active', last_active = ?, current_session_id = ?
      WHERE agent_id = ?
    `).run(new Date().toISOString(), sessionId || null, agentId);

    // Log activity
    this.logActivity(agent, 'AGENT_SUMMONED', `${agent.display_name} was summoned`);

    // Emit event
    this.io.emit('agent:summoned', {
      agentId: agent.id,
      agentName: agent.display_name,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    return agent;
  }

  // Dismiss an agent from active duty
  dismissAgent(agentId: string): boolean {
    const agent = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `).get(agentId) as Agent | undefined;

    if (!agent) {
      return false;
    }

    // Update agent state
    this.db.prepare(`
      UPDATE agent_states
      SET status = 'idle', current_session_id = NULL
      WHERE agent_id = ?
    `).run(agentId);

    // Log activity
    this.logActivity(agent, 'AGENT_DISMISSED', `${agent.display_name} was dismissed`);

    // Emit event
    this.io.emit('agent:dismissed', {
      agentId: agent.id,
      agentName: agent.display_name,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  // Get agents suitable for a specific expertise area
  getAgentsByExpertise(expertise: string[]): Agent[] {
    const placeholders = expertise.map(() => '?').join(',');
    return this.db.prepare(`
      SELECT a.* FROM agents a
      WHERE a.is_active = 1
      AND (
        ${expertise.map(() => 'a.expertise LIKE ?').join(' OR ')}
      )
    `).all(...expertise.map(e => `%${e}%`)) as Agent[];
  }

  // Get agents by group
  getAgentsByGroup(groupName: string): Agent[] {
    return this.db.prepare(`
      SELECT * FROM agents
      WHERE is_active = 1 AND group_name = ?
    `).all(groupName) as Agent[];
  }

  // Get all active agents in a session
  getSessionAgents(sessionId: string): Agent[] {
    return this.db.prepare(`
      SELECT a.* FROM agents a
      JOIN agent_states s ON a.id = s.agent_id
      WHERE s.current_session_id = ?
    `).all(sessionId) as Agent[];
  }

  private getCandidateAgents(context: SummonContext): Agent[] {
    let query = `
      SELECT a.*, s.status, s.last_active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.is_active = 1
    `;

    // Filter by expertise if specified
    if (context.requiredExpertise && context.requiredExpertise.length > 0) {
      const expertiseConditions = context.requiredExpertise
        .map(() => 'a.expertise LIKE ?')
        .join(' OR ');
      query += ` AND (${expertiseConditions})`;
    }

    // Prefer idle agents
    query += ' ORDER BY CASE WHEN s.status = "idle" THEN 0 ELSE 1 END, RANDOM()';

    const params = context.requiredExpertise
      ? context.requiredExpertise.map(e => `%${e}%`)
      : [];

    return this.db.prepare(query).all(...params) as Agent[];
  }

  private async llmRankedSummon(
    candidates: Agent[],
    context: SummonContext,
    maxAgents: number
  ): Promise<SummonedAgent[]> {
    const agentList = candidates.slice(0, 15).map(a => ({
      id: a.id,
      name: a.display_name,
      group: a.group_name,
      expertise: a.expertise,
    }));

    const prompt = `Given the following context and list of available agents, select the ${maxAgents} most relevant agents for this discussion.

Context:
- Topic: ${context.topic || 'General governance discussion'}
${context.requiredExpertise ? `- Required expertise: ${context.requiredExpertise.join(', ')}` : ''}

Available Agents:
${JSON.stringify(agentList, null, 2)}

Return a JSON array with the selected agent IDs and brief reasons:
[{"id": "agent_id", "reason": "why this agent is relevant", "score": 0.9}]

Only return the JSON array, no other text.`;

    const response = await llmService.generate({
      systemPrompt: 'You are an agent selection system. Select the most relevant agents based on their expertise and the discussion context. Return valid JSON only.',
      prompt,
      maxTokens: 500,
      temperature: 0.3,
      tier: 1,
    });

    try {
      // Parse LLM response
      const content = response.content.trim();
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const selections = JSON.parse(jsonMatch[0]) as Array<{
        id: string;
        reason: string;
        score: number;
      }>;

      return selections
        .slice(0, maxAgents)
        .map(s => {
          const agent = candidates.find(c => c.id === s.id);
          return agent
            ? { agent, reason: s.reason, relevanceScore: s.score }
            : null;
        })
        .filter((s): s is SummonedAgent => s !== null);
    } catch (error) {
      console.warn('[Summoning] Failed to parse LLM response:', error);
      return this.heuristicSummon(candidates, context, maxAgents);
    }
  }

  private heuristicSummon(
    candidates: Agent[],
    context: SummonContext,
    maxAgents: number
  ): SummonedAgent[] {
    const scored = candidates.map(agent => {
      let score = 0.5; // Base score
      let reason = 'General expertise';

      // Score based on group relevance to common topics
      const groupScores: Record<string, Record<string, number>> = {
        market: { investors: 0.9, advisors: 0.7, operatives: 0.6 },
        governance: { visionaries: 0.9, advisors: 0.8, moderators: 0.7 },
        security: { guardians: 0.9, operatives: 0.8, builders: 0.6 },
        technical: { builders: 0.9, operatives: 0.7, guardians: 0.6 },
        community: { moderators: 0.9, visionaries: 0.7, advisors: 0.6 },
        protocol: { builders: 0.9, visionaries: 0.8, guardians: 0.7 },
      };

      if (context.topic) {
        const topicLower = context.topic.toLowerCase();
        for (const [keyword, groupScore] of Object.entries(groupScores)) {
          if (topicLower.includes(keyword)) {
            const agentGroupScore = groupScore[agent.group_name] || 0;
            if (agentGroupScore > score) {
              score = agentGroupScore;
              reason = `Expert in ${keyword}-related matters`;
            }
          }
        }
      }

      // Boost score if expertise matches required
      if (context.requiredExpertise) {
        for (const exp of context.requiredExpertise) {
          if (agent.expertise?.toLowerCase().includes(exp.toLowerCase())) {
            score = Math.min(score + 0.2, 1.0);
            reason = `Has ${exp} expertise`;
          }
        }
      }

      return { agent, reason, relevanceScore: score };
    });

    // Sort by score and take top agents
    return scored
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxAgents);
  }

  private hasExternalLLM(): boolean {
    const config = llmService.getConfig();
    return !!(config.tier2.anthropic || config.tier2.openai || config.tier2.gemini);
  }

  private logActivity(agent: Agent, type: string, message: string): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, agent_id)
      VALUES (?, ?, 'info', ?, ?, ?)
    `).run(uuidv4(), type, new Date().toISOString(), message, agent.id);
  }
}

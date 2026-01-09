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
  speaking_style: string;
  idle_messages: string;
  color: string;
}

interface ChatterMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_color: string;
  content: string;
  tier: number;
  created_at: string;
}

export class ChatterService {
  private db: Database.Database;
  private io: SocketServer;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private chatterInterval: number;
  private lastChatterAgent: string | null = null;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.chatterInterval = parseInt(process.env.CHATTER_INTERVAL_MS || '30000'); // 30 seconds
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Chatter] Service started with interval: ${this.chatterInterval}ms`);

    // Initial chatter after 5 seconds
    setTimeout(() => this.generateChatter(), 5000);

    // Regular chatter interval
    this.intervalId = setInterval(() => this.generateChatter(), this.chatterInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Chatter] Service stopped');
  }

  private async generateChatter(): Promise<void> {
    try {
      // Get a random agent (different from last one)
      const agent = this.getRandomAgent();
      if (!agent) return;

      // Generate chatter content
      const content = await this.generateContent(agent);
      if (!content) return;

      // Save to database
      const message = this.saveChatter(agent, content);

      // Emit to all connected clients
      this.io.emit('agent:chatter', message);

      // Log activity
      this.logActivity(agent, content);

      console.log(`[Chatter] ${agent.display_name}: ${content.substring(0, 50)}...`);
    } catch (error) {
      console.error('[Chatter] Error generating chatter:', error);
    }
  }

  private getRandomAgent(): Agent | null {
    try {
      // Get active agents, excluding the last one who spoke
      let query = `
        SELECT * FROM agents
        WHERE is_active = 1
      `;

      if (this.lastChatterAgent) {
        query += ` AND id != '${this.lastChatterAgent}'`;
      }

      query += ' ORDER BY RANDOM() LIMIT 1';

      const agent = this.db.prepare(query).get() as Agent | undefined;

      if (agent) {
        this.lastChatterAgent = agent.id;
      }

      return agent || null;
    } catch (error) {
      console.error('[Chatter] Error getting random agent:', error);
      return null;
    }
  }

  private async generateContent(agent: Agent): Promise<string | null> {
    // Parse idle messages
    let idleMessages: string[] = [];
    try {
      idleMessages = JSON.parse(agent.idle_messages || '[]');
    } catch {
      idleMessages = [];
    }

    // First try: Use LLM to generate contextual chatter
    if (llmService.isTier1Available() || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      try {
        const response = await llmService.generate({
          systemPrompt: this.buildSystemPrompt(agent),
          prompt: this.buildChatterPrompt(agent),
          maxTokens: 100,
          temperature: 0.8,
          tier: 1, // Prefer local LLM for chatter
        });

        if (response.content) {
          // Clean up the response
          let content = response.content
            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
            .replace(/\n/g, ' ') // Remove newlines
            .trim();

          // Ensure it's not too long
          if (content.length > 200) {
            content = content.substring(0, 197) + '...';
          }

          return content;
        }
      } catch (error) {
        console.warn('[Chatter] LLM generation failed, using fallback');
      }
    }

    // Fallback: Use predefined idle messages
    if (idleMessages.length > 0) {
      return idleMessages[Math.floor(Math.random() * idleMessages.length)];
    }

    // Last resort: Generic message based on group
    return this.getGenericMessage(agent.group_name);
  }

  private buildSystemPrompt(agent: Agent): string {
    return `You are ${agent.display_name}, an AI agent in a governance platform.

Persona: ${agent.persona_prompt}
Speaking Style: ${agent.speaking_style || 'Professional and thoughtful'}
Group: ${agent.group_name}

You are currently in the lobby, making casual observations or comments. Keep your messages:
- Brief (1-2 sentences max)
- In character with your persona
- Related to governance, crypto, or general observations
- Natural and conversational

Do NOT include any prefixes like "Agent:" or quotes around your message.`;
  }

  private buildChatterPrompt(agent: Agent): string {
    const topics = [
      'recent market movements',
      'governance proposals',
      'community engagement',
      'protocol improvements',
      'the current state of DeFi',
      'upcoming votes',
      'ecosystem growth',
      'transparency in governance',
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    return `Generate a single brief casual comment about ${topic}. Stay in character.`;
  }

  private getGenericMessage(groupName: string): string {
    const messages: Record<string, string[]> = {
      visionaries: [
        'The future of decentralized governance is bright.',
        'Innovation requires bold thinking and careful execution.',
        'We must always keep the long-term vision in mind.',
      ],
      builders: [
        'Code review looks good. Ship it.',
        'Working on some optimizations for the next release.',
        'Documentation is just as important as the code.',
      ],
      investors: [
        'Market sentiment appears cautiously optimistic.',
        'Diversification remains key in volatile markets.',
        'The fundamentals look strong.',
      ],
      guardians: [
        'Security audit in progress. All systems nominal.',
        'Risk parameters are within acceptable bounds.',
        'Vigilance is our greatest asset.',
      ],
      operatives: [
        'Data collection pipeline running smoothly.',
        'Signal analysis shows interesting patterns.',
        'Processing incoming data streams.',
      ],
      moderators: [
        'Community engagement metrics are healthy.',
        'Keeping the discourse productive and respectful.',
        'Good conversations happening in the forums.',
      ],
      advisors: [
        'Experience suggests a measured approach here.',
        'Let me share some historical context.',
        'Consider both short and long-term implications.',
      ],
    };

    const groupMessages = messages[groupName] || messages.advisors;
    return groupMessages[Math.floor(Math.random() * groupMessages.length)];
  }

  private saveChatter(agent: Agent, content: string): ChatterMessage {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO agent_chatter (id, agent_id, content, tier, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, agent.id, content, llmService.isTier1Available() ? 1 : 0, now);

    // Update agent's last chatter time
    this.db.prepare(`
      UPDATE agent_states
      SET last_chatter = ?, status = 'active', last_active = ?
      WHERE agent_id = ?
    `).run(now, now, agent.id);

    // Reset to idle after a short delay
    setTimeout(() => {
      this.db.prepare(`
        UPDATE agent_states SET status = 'idle' WHERE agent_id = ?
      `).run(agent.id);

      this.io.emit('agent:stateChange', {
        agentId: agent.id,
        state: 'idle',
      });
    }, 5000);

    return {
      id,
      agent_id: agent.id,
      agent_name: agent.display_name,
      agent_color: agent.color,
      content,
      tier: llmService.isTier1Available() ? 1 : 0,
      created_at: now,
    };
  }

  private logActivity(agent: Agent, content: string): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, agent_id, details)
      VALUES (?, 'AGENT_CHATTER', 'info', ?, ?, ?, ?)
    `).run(
      uuidv4(),
      new Date().toISOString(),
      `${agent.display_name} said something`,
      agent.id,
      content.substring(0, 100)
    );
  }

  // Get recent chatter messages
  getRecentChatter(limit: number = 20): ChatterMessage[] {
    return this.db.prepare(`
      SELECT
        c.id, c.agent_id, c.content, c.tier, c.created_at,
        a.display_name as agent_name, a.color as agent_color
      FROM agent_chatter c
      JOIN agents a ON c.agent_id = a.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(limit) as ChatterMessage[];
  }
}

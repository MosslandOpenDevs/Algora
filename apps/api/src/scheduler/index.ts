import { Server as SocketServer } from 'socket.io';
import type Database from 'better-sqlite3';
import { ActivityService } from '../activity';
import type { GovernanceOSBridge } from '../services/governance-os-bridge';

export type Tier = 0 | 1 | 2;

export interface SchedulerConfig {
  tier0Interval: number;  // Default: 60000 (1 min)
  tier1Interval: number;  // Default: 5000-15000 (5-15 sec)
  tier2ScheduledRuns: number[];  // Default: [6, 12, 18, 23]
}

export class SchedulerService {
  private db: Database.Database;
  private io: SocketServer;
  private activityService: ActivityService;
  private governanceOSBridge: GovernanceOSBridge | null = null;
  private config: SchedulerConfig;
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(
    db: Database.Database,
    io: SocketServer,
    activityService: ActivityService,
    config?: Partial<SchedulerConfig>
  ) {
    this.db = db;
    this.io = io;
    this.activityService = activityService;
    this.config = {
      tier0Interval: config?.tier0Interval || 60000,
      tier1Interval: config?.tier1Interval || 10000,
      tier2ScheduledRuns: config?.tier2ScheduledRuns || [6, 12, 18, 23],
    };
  }

  /**
   * Set the GovernanceOS Bridge for Tier 2 operations
   */
  setGovernanceOSBridge(bridge: GovernanceOSBridge): void {
    this.governanceOSBridge = bridge;
    console.info('[Scheduler] GovernanceOS Bridge connected');
  }

  start(): void {
    if (this.isRunning) {
      console.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.info('Starting scheduler...');

    // Start Tier 0 tasks (data collection)
    this.startTier0();

    // Start Tier 1 tasks (agent chatter)
    this.startTier1();

    // Schedule Tier 2 tasks
    this.scheduleTier2();

    this.activityService.log('SYSTEM_STATUS', 'info', 'Scheduler started', {
      details: { config: this.config },
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear all intervals
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      console.info(`Stopped interval: ${name}`);
    }
    this.intervals.clear();

    this.activityService.log('SYSTEM_STATUS', 'info', 'Scheduler stopped');
  }

  private startTier0(): void {
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.runTier0Tasks();
      } catch (error) {
        console.error('Tier 0 task error:', error);
        this.activityService.log('COLLECTOR', 'error', 'Tier 0 task failed', {
          details: { error: String(error) },
        });
      }
    }, this.config.tier0Interval);

    this.intervals.set('tier0', interval);
    console.info(`Tier 0 scheduler started (interval: ${this.config.tier0Interval}ms)`);
  }

  private startTier1(): void {
    const runChatter = () => {
      if (!this.isRunning) return;

      // Random interval between 5-15 seconds
      const nextInterval = 5000 + Math.random() * 10000;

      setTimeout(async () => {
        try {
          await this.runTier1Tasks();
        } catch (error) {
          console.error('Tier 1 task error:', error);
        }
        runChatter();
      }, nextInterval);
    };

    runChatter();
    console.info('Tier 1 scheduler started (chatter mode)');
  }

  private scheduleTier2(): void {
    // Check every minute if it's time to run Tier 2
    const interval = setInterval(() => {
      if (!this.isRunning) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Run at the start of scheduled hours
      if (this.config.tier2ScheduledRuns.includes(currentHour) && currentMinute === 0) {
        this.runTier2Tasks().catch(error => {
          console.error('Tier 2 task error:', error);
          this.activityService.log('SYSTEM_STATUS', 'error', 'Tier 2 scheduled run failed', {
            details: { error: String(error) },
          });
        });
      }
    }, 60000);

    this.intervals.set('tier2', interval);
    console.info(`Tier 2 scheduler started (hours: ${this.config.tier2ScheduledRuns.join(', ')})`);
  }

  private async runTier0Tasks(): Promise<void> {
    // Signal collection is handled by SignalCollectorService (RSS, GitHub, Blockchain, Social)
    // This method logs periodic status for monitoring purposes
    this.activityService.log('COLLECTOR', 'info', 'Tier 0 data collection active', {
      metadata: { tier: 0, note: 'Signal collectors running independently' },
    });
  }

  private async runTier1Tasks(): Promise<void> {
    // Generate agent chatter using local LLM
    // Placeholder - will be implemented with actual LLM integration
    const agents = this.db.prepare(`
      SELECT a.id, a.name, a.display_name, a.color, a.idle_messages
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.is_active = 1 AND (s.status IS NULL OR s.status = 'idle')
      ORDER BY RANDOM()
      LIMIT 1
    `).all() as any[];

    if (agents.length > 0) {
      const agent = agents[0];
      const idleMessages = agent.idle_messages ? JSON.parse(agent.idle_messages) : [];
      const message = idleMessages.length > 0
        ? idleMessages[Math.floor(Math.random() * idleMessages.length)]
        : `${agent.display_name} is observing the system...`;

      // Emit chatter event
      this.io.emit('agent:chatter', {
        agentId: agent.id,
        agentName: agent.display_name,
        message,
        color: agent.color,
        timestamp: new Date().toISOString(),
      });

      // Log activity
      this.activityService.log('AGENT_CHATTER', 'info', message, {
        agentId: agent.id,
        metadata: { tier: 1 },
      });
    }
  }

  private async runTier2Tasks(): Promise<void> {
    // Run serious deliberation using external LLM
    this.activityService.log('SYSTEM_STATUS', 'info', 'Running Tier 2 deliberation', {
      metadata: { tier: 2 },
    });

    if (!this.governanceOSBridge) {
      console.warn('[Scheduler] GovernanceOS Bridge not available, skipping Tier 2 tasks');
      return;
    }

    try {
      // 1. Find pending/confirmed issues that need pipeline processing
      const pendingIssues = this.db.prepare(`
        SELECT * FROM issues
        WHERE status IN ('detected', 'confirmed')
        AND priority IN ('critical', 'high')
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            ELSE 3
          END,
          created_at ASC
        LIMIT 5
      `).all() as Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        priority: string;
        status: string;
        detected_at: string;
        created_at: string;
      }>;

      if (pendingIssues.length === 0) {
        console.info('[Scheduler] No pending issues to process');
        return;
      }

      console.info(`[Scheduler] Processing ${pendingIssues.length} pending issues`);

      // 2. Process each issue through the governance pipeline
      for (const issue of pendingIssues) {
        try {
          console.info(`[Scheduler] Running pipeline for issue: ${issue.id.slice(0, 8)} - ${issue.title}`);

          // Determine workflow type based on category
          const workflowType = this.determineWorkflowType(issue.category);

          // Run the pipeline
          const result = await this.governanceOSBridge.runPipelineForIssue(issue.id, {
            workflowType,
          });

          if (result.success) {
            this.activityService.log('PIPELINE', 'info', `Pipeline completed for issue: ${issue.title}`, {
              details: { issueId: issue.id, workflowType, status: result.status },
              metadata: { tier: 2 },
            });

            // Emit event for real-time updates
            this.io.emit('governance:pipeline:completed', {
              issueId: issue.id,
              workflowType,
              success: true,
              timestamp: new Date().toISOString(),
            });

            // Record KPI timing: issue to decision packet
            try {
              const kpiCollector = this.governanceOSBridge.getGovernanceOS().getKPICollector();
              const issueDetectedAt = new Date(issue.detected_at || issue.created_at).getTime();
              const issueToDecisionMs = Date.now() - issueDetectedAt;
              kpiCollector.recordExecutionTiming('issueToDecisionMs', issueToDecisionMs);
              console.log(`[Scheduler] Recorded KPI: issue to decision = ${(issueToDecisionMs / 1000 / 60).toFixed(1)} minutes`);
            } catch (kpiError) {
              console.warn('[Scheduler] Failed to record KPI timing:', kpiError);
            }
          } else {
            console.error(`[Scheduler] Pipeline failed for issue ${issue.id}: status=${result.status}`);
          }

          // Small delay between pipeline runs to avoid overloading
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`[Scheduler] Failed to process issue ${issue.id}:`, error);
          this.activityService.log('PIPELINE', 'error', `Pipeline failed for issue: ${issue.title}`, {
            details: { issueId: issue.id, error: String(error) },
            metadata: { tier: 2 },
          });
        }
      }

      // 3. Check for proposals that need voting sessions
      await this.processProposalsForVoting();

      // 4. Check for high-risk actions that need locking
      await this.processHighRiskActions();

    } catch (error) {
      console.error('[Scheduler] Tier 2 task error:', error);
      throw error;
    }
  }

  /**
   * Process proposals that need voting sessions
   */
  private async processProposalsForVoting(): Promise<void> {
    if (!this.governanceOSBridge) return;

    try {
      // Find approved proposals without voting sessions
      const proposals = this.db.prepare(`
        SELECT * FROM proposals
        WHERE status = 'pending'
        AND id NOT IN (
          SELECT DISTINCT JSON_EXTRACT(content, '$.proposalId')
          FROM (
            SELECT content FROM governance_documents
            WHERE type = 'PP'
          )
        )
        LIMIT 3
      `).all() as Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        status: string;
      }>;

      for (const proposal of proposals) {
        try {
          // Classify risk level
          const riskLevel = this.governanceOSBridge.classifyRisk(proposal.category);

          // Create voting session
          const voting = await this.governanceOSBridge.createDualHouseVoting({
            proposalId: proposal.id,
            title: proposal.title,
            summary: proposal.description?.substring(0, 500) || proposal.title,
            riskLevel,
            category: proposal.category,
            createdBy: 'scheduler-tier2',
          });

          console.info(`[Scheduler] Created voting session ${voting.id} for proposal ${proposal.id.slice(0, 8)}`);

          this.activityService.log('VOTING', 'info', `Voting session created for: ${proposal.title}`, {
            details: { proposalId: proposal.id, votingId: voting.id },
            metadata: { tier: 2 },
          });

        } catch (error) {
          console.error(`[Scheduler] Failed to create voting for proposal ${proposal.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Failed to process proposals for voting:', error);
    }
  }

  /**
   * Process high-risk actions that need locking
   */
  private async processHighRiskActions(): Promise<void> {
    if (!this.governanceOSBridge) return;

    try {
      // Find critical issues that might need high-risk approval
      const criticalIssues = this.db.prepare(`
        SELECT * FROM issues
        WHERE priority = 'critical'
        AND status = 'in_progress'
        LIMIT 3
      `).all() as Array<{
        id: string;
        title: string;
        description: string;
        category: string;
      }>;

      for (const issue of criticalIssues) {
        const riskLevel = this.governanceOSBridge.classifyRisk(issue.category);

        if (riskLevel === 'HIGH') {
          // Check if already has an approval request
          const existingApprovals = await this.governanceOSBridge.listAllApprovals({ status: 'locked' });
          const hasApproval = existingApprovals.actions.some(
            a => JSON.stringify(a).includes(issue.id)
          );

          if (!hasApproval) {
            try {
              const approval = await this.governanceOSBridge.createHighRiskApproval({
                proposalId: issue.id,
                votingId: '', // Will be linked when voting is created
                actionDescription: `High-risk action for critical issue: ${issue.title}`,
                actionType: issue.category,
              });

              console.info(`[Scheduler] Created high-risk approval ${approval.id} for issue ${issue.id.slice(0, 8)}`);

              this.activityService.log('APPROVAL', 'warning', `High-risk approval required: ${issue.title}`, {
                details: { issueId: issue.id, approvalId: approval.id },
                metadata: { tier: 2, riskLevel: 'HIGH' },
              });

            } catch (error) {
              console.error(`[Scheduler] Failed to create approval for issue ${issue.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler] Failed to process high-risk actions:', error);
    }
  }

  /**
   * Determine workflow type based on issue category
   */
  private determineWorkflowType(category: string): 'A' | 'B' | 'C' | 'D' | 'E' {
    const cat = category.toLowerCase();

    if (cat.includes('ai') || cat.includes('research') || cat.includes('academic')) {
      return 'A'; // Academic Activity
    }
    if (cat.includes('dev') || cat.includes('grant') || cat.includes('developer')) {
      return 'C'; // Developer Support
    }
    if (cat.includes('partnership') || cat.includes('expansion') || cat.includes('ecosystem')) {
      return 'D'; // Ecosystem Expansion
    }
    if (cat.includes('group') || cat.includes('committee') || cat.includes('working')) {
      return 'E'; // Working Groups
    }
    // Default to Free Debate
    return 'B';
  }

  async triggerTier2(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    await this.runTier2Tasks();
  }

  getStatus(): {
    isRunning: boolean;
    config: SchedulerConfig;
    activeIntervals: string[];
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      activeIntervals: Array.from(this.intervals.keys()),
    };
  }
}

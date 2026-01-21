import { Server as SocketServer } from 'socket.io';
import type Database from 'better-sqlite3';
import { ActivityService } from '../activity';
import type { GovernanceOSBridge } from '../services/governance-os-bridge';
import type { ReportGeneratorService } from '../services/report-generator';
import { DataRetentionService } from '../services/data-retention';
import { BudgetAlertService } from '../services/budget-alerts';
import { KPIPersistenceService } from '../services/kpi-persistence';
import type { PassiveConsensusService } from '../services/passive-consensus';

export type Tier = 0 | 1 | 2;

export interface SchedulerConfig {
  tier0Interval: number;  // Default: 60000 (1 min)
  tier1Interval: number;  // Default: 5000-15000 (5-15 sec)
  tier2ScheduledRuns: number[];  // Default: [6, 12, 18, 23]
  weeklyReportDay: number;  // Day of week (0=Sunday, 1=Monday, etc.)
  weeklyReportHour: number; // Hour to run (0-23)
  monthlyReportDay: number; // Day of month (1-28)
  monthlyReportHour: number; // Hour to run (0-23)
  dataCleanupHour: number; // Hour to run daily data cleanup (0-23)
}

export class SchedulerService {
  private db: Database.Database;
  private io: SocketServer;
  private activityService: ActivityService;
  private governanceOSBridge: GovernanceOSBridge | null = null;
  private reportGenerator: ReportGeneratorService | null = null;
  private passiveConsensusService: PassiveConsensusService | null = null;
  private dataRetention: DataRetentionService;
  private budgetAlerts: BudgetAlertService;
  private kpiPersistence: KPIPersistenceService;
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
      weeklyReportDay: config?.weeklyReportDay ?? 1, // Monday
      weeklyReportHour: config?.weeklyReportHour ?? 0, // 00:00 UTC
      monthlyReportDay: config?.monthlyReportDay ?? 1, // 1st of month
      monthlyReportHour: config?.monthlyReportHour ?? 0, // 00:00 UTC
      dataCleanupHour: config?.dataCleanupHour ?? 3, // 03:00 daily
    };

    // Initialize data retention service with standard 30-day policy
    this.dataRetention = new DataRetentionService(db, {
      activityLogRetentionDays: 30,
      heartbeatRetentionDays: 7,
      chatterRetentionDays: 90,
      signalRetentionDays: 90,
      budgetUsageRetentionDays: 365,
    });

    // Initialize budget alert service
    this.budgetAlerts = new BudgetAlertService(db, io, activityService);

    // Initialize KPI persistence service
    this.kpiPersistence = new KPIPersistenceService(db, io);
  }

  /**
   * Set the Report Generator Service for automated report generation
   */
  setReportGenerator(reportGenerator: ReportGeneratorService): void {
    this.reportGenerator = reportGenerator;
    console.info('[Scheduler] Report Generator connected');
  }

  /**
   * Set the GovernanceOS Bridge for Tier 2 operations
   */
  setGovernanceOSBridge(bridge: GovernanceOSBridge): void {
    this.governanceOSBridge = bridge;
    console.info('[Scheduler] GovernanceOS Bridge connected');
  }

  /**
   * Set the Passive Consensus Service for opt-out approval processing
   */
  setPassiveConsensusService(service: PassiveConsensusService): void {
    this.passiveConsensusService = service;
    console.info('[Scheduler] Passive Consensus Service connected');
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

    // Schedule report generation
    this.scheduleReportGeneration();

    // Schedule daily data cleanup
    this.scheduleDataCleanup();

    // Schedule budget alerts
    this.scheduleBudgetAlerts();

    // Schedule KPI snapshots
    this.scheduleKPISnapshots();

    // Schedule passive consensus processing
    this.schedulePassiveConsensusProcessing();

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

  private scheduleReportGeneration(): void {
    // Check every minute for report generation times
    const interval = setInterval(async () => {
      if (!this.isRunning || !this.reportGenerator) return;

      const now = new Date();
      const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ...
      const currentDate = now.getDate(); // 1-31
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Weekly report: Run on configured day at configured hour
      if (
        currentDay === this.config.weeklyReportDay &&
        currentHour === this.config.weeklyReportHour &&
        currentMinute === 0
      ) {
        console.info('[Scheduler] Running scheduled weekly report generation');
        try {
          const result = await this.reportGenerator.generateWeeklyReport(true);
          this.activityService.log('DISCLOSURE_PUBLISH', 'info', `Weekly report generated: ${result.title}`, {
            details: { reportId: result.id },
            metadata: { type: 'weekly', autoGenerated: true },
          });
        } catch (error) {
          console.error('[Scheduler] Weekly report generation failed:', error);
          this.activityService.log('SYSTEM_STATUS', 'error', 'Weekly report generation failed', {
            details: { error: String(error) },
          });
        }
      }

      // Monthly report: Run on configured day of month at configured hour
      if (
        currentDate === this.config.monthlyReportDay &&
        currentHour === this.config.monthlyReportHour &&
        currentMinute === 0
      ) {
        console.info('[Scheduler] Running scheduled monthly report generation');
        try {
          const result = await this.reportGenerator.generateMonthlyReport(true);
          this.activityService.log('DISCLOSURE_PUBLISH', 'info', `Monthly report generated: ${result.title}`, {
            details: { reportId: result.id },
            metadata: { type: 'monthly', autoGenerated: true },
          });
        } catch (error) {
          console.error('[Scheduler] Monthly report generation failed:', error);
          this.activityService.log('SYSTEM_STATUS', 'error', 'Monthly report generation failed', {
            details: { error: String(error) },
          });
        }
      }
    }, 60000); // Check every minute

    this.intervals.set('reportGeneration', interval);
    console.info(`[Scheduler] Report generation scheduled (weekly: day ${this.config.weeklyReportDay} hour ${this.config.weeklyReportHour}, monthly: day ${this.config.monthlyReportDay} hour ${this.config.monthlyReportHour})`);
  }

  private scheduleDataCleanup(): void {
    // Check every minute for data cleanup time
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Run data cleanup at configured hour (default 03:00)
      if (currentHour === this.config.dataCleanupHour && currentMinute === 0) {
        console.info('[Scheduler] Running scheduled data cleanup');
        try {
          const report = await this.dataRetention.runCleanup();

          this.activityService.log('SYSTEM_STATUS', 'info', `Data cleanup completed: ${report.totalDeleted} rows deleted`, {
            details: {
              totalDeleted: report.totalDeleted,
              results: report.results,
              errors: report.errors,
            },
            metadata: { type: 'data-retention' },
          });

          // Emit event for monitoring
          this.io.emit('system:dataCleanup', {
            totalDeleted: report.totalDeleted,
            results: report.results,
            timestamp: new Date().toISOString(),
          });

        } catch (error) {
          console.error('[Scheduler] Data cleanup failed:', error);
          this.activityService.log('SYSTEM_STATUS', 'error', 'Data cleanup failed', {
            details: { error: String(error) },
          });
        }
      }
    }, 60000); // Check every minute

    this.intervals.set('dataCleanup', interval);
    console.info(`[Scheduler] Data cleanup scheduled (daily at ${this.config.dataCleanupHour}:00)`);
  }

  private scheduleBudgetAlerts(): void {
    // Check budget thresholds every 5 minutes
    const interval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.budgetAlerts.checkBudgetThresholds();
      } catch (error) {
        console.error('[Scheduler] Budget alert check failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    this.intervals.set('budgetAlerts', interval);
    console.info('[Scheduler] Budget alerts scheduled (every 5 minutes)');

    // Also run immediately on startup
    this.budgetAlerts.checkBudgetThresholds().catch(error => {
      console.error('[Scheduler] Initial budget alert check failed:', error);
    });

    // Schedule daily cache clear at midnight
    const scheduleMidnightClear = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - now.getTime();

      setTimeout(() => {
        if (!this.isRunning) return;
        this.budgetAlerts.clearDailyCache();
        scheduleMidnightClear(); // Schedule next day
      }, msUntilMidnight);
    };

    scheduleMidnightClear();
  }

  /**
   * Get the budget alert service for external access
   */
  getBudgetAlertService(): BudgetAlertService {
    return this.budgetAlerts;
  }

  private scheduleKPISnapshots(): void {
    // Take KPI snapshots every 5 minutes
    const interval = setInterval(() => {
      if (!this.isRunning) return;

      try {
        this.kpiPersistence.takeSnapshot();
      } catch (error) {
        console.error('[Scheduler] KPI snapshot failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    this.intervals.set('kpiSnapshots', interval);
    console.info('[Scheduler] KPI snapshots scheduled (every 5 minutes)');

    // Take initial snapshot on startup
    setTimeout(() => {
      if (!this.isRunning) return;
      try {
        this.kpiPersistence.takeSnapshot();
        console.info('[Scheduler] Initial KPI snapshot taken');
      } catch (error) {
        console.error('[Scheduler] Initial KPI snapshot failed:', error);
      }
    }, 5000); // 5 seconds after startup
  }

  /**
   * Get the KPI persistence service for external access
   */
  getKPIPersistenceService(): KPIPersistenceService {
    return this.kpiPersistence;
  }

  private schedulePassiveConsensusProcessing(): void {
    // Process expired passive consensus items every 5 minutes
    const interval = setInterval(async () => {
      if (!this.isRunning || !this.passiveConsensusService) return;

      try {
        const processedCount = await this.passiveConsensusService.processExpiredItems();
        if (processedCount > 0) {
          console.info(`[Scheduler] Passive consensus: ${processedCount} items auto-approved`);
        }
      } catch (error) {
        console.error('[Scheduler] Passive consensus processing failed:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    this.intervals.set('passiveConsensus', interval);
    console.info('[Scheduler] Passive consensus processing scheduled (every 5 minutes)');

    // Also run immediately after a short delay
    setTimeout(async () => {
      if (!this.isRunning || !this.passiveConsensusService) return;
      try {
        const processedCount = await this.passiveConsensusService.processExpiredItems();
        if (processedCount > 0) {
          console.info(`[Scheduler] Initial passive consensus: ${processedCount} items auto-approved`);
        }
      } catch (error) {
        console.error('[Scheduler] Initial passive consensus processing failed:', error);
      }
    }, 10000); // 10 seconds after startup
  }

  /**
   * Get the passive consensus service for external access
   */
  getPassiveConsensusService(): PassiveConsensusService | null {
    return this.passiveConsensusService;
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
    dataSizes?: Record<string, number>;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      activeIntervals: Array.from(this.intervals.keys()),
      dataSizes: this.dataRetention.getDataSizes(),
    };
  }

  /**
   * Manually trigger data cleanup
   */
  async triggerDataCleanup(): Promise<{ totalDeleted: number; results: { table: string; deletedRows: number }[] }> {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    const report = await this.dataRetention.runCleanup();

    this.activityService.log('SYSTEM_STATUS', 'info', `Manual data cleanup: ${report.totalDeleted} rows deleted`, {
      details: { results: report.results },
      metadata: { type: 'data-retention', manual: true },
    });

    return {
      totalDeleted: report.totalDeleted,
      results: report.results.map(r => ({ table: r.table, deletedRows: r.deletedRows })),
    };
  }

  /**
   * Get data retention configuration
   */
  getRetentionConfig(): ReturnType<DataRetentionService['getConfig']> {
    return this.dataRetention.getConfig();
  }
}

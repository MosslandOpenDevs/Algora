import type Database from 'better-sqlite3';

export interface RetentionConfig {
  activityLogRetentionDays: number;
  heartbeatRetentionDays: number;
  // High-volume noise types (COLLECTOR_HEALTH, AGENT_CHATTER, COLLECTOR) drown
  // out the actual governance signal in activity_log. Trim them aggressively.
  noiseRetentionDays: number;
  chatterRetentionDays: number;
  signalRetentionDays: number;
  budgetUsageRetentionDays: number;
}

export interface CleanupResult {
  table: string;
  deletedRows: number;
  durationMs: number;
}

export interface DataRetentionReport {
  startedAt: string;
  completedAt: string;
  totalDeleted: number;
  results: CleanupResult[];
  errors: string[];
}

const DEFAULT_CONFIG: RetentionConfig = {
  activityLogRetentionDays: 30,
  heartbeatRetentionDays: 7,
  noiseRetentionDays: 7,
  chatterRetentionDays: 30,
  signalRetentionDays: 30,
  budgetUsageRetentionDays: 365, // Keep budget data for a year
};

const NOISE_TYPES = ['HEARTBEAT', 'COLLECTOR_HEALTH', 'AGENT_CHATTER', 'COLLECTOR'] as const;

export class DataRetentionService {
  private db: Database.Database;
  private config: RetentionConfig;

  constructor(db: Database.Database, config?: Partial<RetentionConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run data cleanup for all tables according to retention policy
   */
  async runCleanup(): Promise<DataRetentionReport> {
    const startedAt = new Date().toISOString();
    const results: CleanupResult[] = [];
    const errors: string[] = [];

    console.log('[DataRetention] Starting data cleanup...');

    // 1. Clean activity_log (governance/audit-relevant types)
    try {
      const result = this.cleanActivityLog();
      results.push(result);
    } catch (error) {
      errors.push(`activity_log: ${String(error)}`);
    }

    // 2. Clean high-volume noise types (HEARTBEAT, COLLECTOR_HEALTH,
    //    AGENT_CHATTER, COLLECTOR) with shorter retention. These are 90%+ of
    //    activity_log volume and have no audit value beyond a few days.
    try {
      const result = this.cleanNoiseTypes();
      results.push(result);
    } catch (error) {
      errors.push(`noise_types: ${String(error)}`);
    }

    // 3. Clean agent_chatter
    try {
      const result = this.cleanChatter();
      results.push(result);
    } catch (error) {
      errors.push(`agent_chatter: ${String(error)}`);
    }

    // 4. Clean signals
    try {
      const result = this.cleanSignals();
      results.push(result);
    } catch (error) {
      errors.push(`signals: ${String(error)}`);
    }

    // 5. Clean old budget_usage entries
    try {
      const result = this.cleanBudgetUsage();
      results.push(result);
    } catch (error) {
      errors.push(`budget_usage: ${String(error)}`);
    }

    // 6. Clean old scheduler_tasks (completed/failed)
    try {
      const result = this.cleanSchedulerTasks();
      results.push(result);
    } catch (error) {
      errors.push(`scheduler_tasks: ${String(error)}`);
    }

    const completedAt = new Date().toISOString();
    const totalDeleted = results.reduce((sum, r) => sum + r.deletedRows, 0);

    const report: DataRetentionReport = {
      startedAt,
      completedAt,
      totalDeleted,
      results,
      errors,
    };

    console.log(`[DataRetention] Cleanup completed: ${totalDeleted} rows deleted in ${results.length} tables`);
    if (errors.length > 0) {
      console.error(`[DataRetention] Errors: ${errors.join(', ')}`);
    }

    return report;
  }

  /**
   * Clean activity_log entries older than retention period (governance types only)
   */
  private cleanActivityLog(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.activityLogRetentionDays);

    const placeholders = NOISE_TYPES.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      DELETE FROM activity_log
      WHERE type NOT IN (${placeholders})
      AND timestamp < ?
    `);

    const result = stmt.run(...NOISE_TYPES, cutoffDate);

    return {
      table: 'activity_log',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean high-volume noise types from activity_log with short retention.
   * Uses heartbeatRetentionDays for HEARTBEAT (compatibility) and
   * noiseRetentionDays for the rest.
   */
  private cleanNoiseTypes(): CleanupResult {
    const startTime = Date.now();
    const heartbeatCutoff = this.getCutoffDate(this.config.heartbeatRetentionDays);
    const noiseCutoff = this.getCutoffDate(this.config.noiseRetentionDays);

    const heartbeatResult = this.db.prepare(`
      DELETE FROM activity_log WHERE type = 'HEARTBEAT' AND timestamp < ?
    `).run(heartbeatCutoff);

    const otherTypes = NOISE_TYPES.filter((t) => t !== 'HEARTBEAT');
    const placeholders = otherTypes.map(() => '?').join(',');
    const otherResult = this.db.prepare(`
      DELETE FROM activity_log
      WHERE type IN (${placeholders})
      AND timestamp < ?
    `).run(...otherTypes, noiseCutoff);

    return {
      table: 'activity_log (noise)',
      deletedRows: heartbeatResult.changes + otherResult.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean agent_chatter entries older than retention period
   */
  private cleanChatter(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.chatterRetentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM agent_chatter
      WHERE created_at < ?
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'agent_chatter',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean signals older than retention period.
   * Preserves any signal referenced by issue_signals so we don't break the
   * audit trail for detected issues — those signals are kept until the
   * referencing issue itself ages out of the system.
   */
  private cleanSignals(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.signalRetentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM signals
      WHERE created_at < ?
        AND id NOT IN (SELECT signal_id FROM issue_signals)
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'signals',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean budget_usage entries older than retention period
   */
  private cleanBudgetUsage(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.budgetUsageRetentionDays).split('T')[0]; // Date only

    const stmt = this.db.prepare(`
      DELETE FROM budget_usage
      WHERE date < ?
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'budget_usage',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean completed/failed scheduler_tasks older than 30 days
   */
  private cleanSchedulerTasks(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(30); // 30 days retention for completed tasks

    const stmt = this.db.prepare(`
      DELETE FROM scheduler_tasks
      WHERE status IN ('completed', 'failed')
      AND completed_at < ?
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'scheduler_tasks',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get ISO date string for cutoff date (days ago)
   */
  private getCutoffDate(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  }

  /**
   * Get current data sizes for monitoring
   */
  getDataSizes(): Record<string, number> {
    const tables = [
      'activity_log',
      'agent_chatter',
      'agora_messages',
      'signals',
      'issues',
      'proposals',
      'votes',
      'budget_usage',
      'scheduler_tasks',
    ] as const;

    const sizes: Record<string, number> = {};
    const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

    for (const table of tables) {
      // Defense-in-depth: table names cannot be parameterized in SQLite,
      // so validate against a strict identifier pattern before interpolation.
      if (!IDENTIFIER_RE.test(table)) {
        sizes[table] = -1;
        continue;
      }
      try {
        const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
        sizes[table] = result.count;
      } catch {
        sizes[table] = -1; // Table doesn't exist
      }
    }

    return sizes;
  }

  /**
   * Get retention configuration
   */
  getConfig(): RetentionConfig {
    return { ...this.config };
  }
}

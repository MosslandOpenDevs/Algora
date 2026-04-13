import type Database from 'better-sqlite3';

export interface RetentionConfig {
  activityLogRetentionDays: number;
  heartbeatRetentionDays: number;
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
  chatterRetentionDays: 90,
  signalRetentionDays: 90,
  budgetUsageRetentionDays: 365, // Keep budget data for a year
};

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

    // 1. Clean activity_log (except HEARTBEAT which has shorter retention)
    try {
      const result = this.cleanActivityLog();
      results.push(result);
    } catch (error) {
      errors.push(`activity_log: ${String(error)}`);
    }

    // 2. Clean HEARTBEAT entries separately (shorter retention)
    try {
      const result = this.cleanHeartbeat();
      results.push(result);
    } catch (error) {
      errors.push(`heartbeat: ${String(error)}`);
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
   * Clean activity_log entries older than retention period (excluding HEARTBEAT)
   */
  private cleanActivityLog(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.activityLogRetentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM activity_log
      WHERE type != 'HEARTBEAT'
      AND timestamp < ?
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'activity_log',
      deletedRows: result.changes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clean HEARTBEAT entries (shorter retention)
   */
  private cleanHeartbeat(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.heartbeatRetentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM activity_log
      WHERE type = 'HEARTBEAT'
      AND timestamp < ?
    `);

    const result = stmt.run(cutoffDate);

    return {
      table: 'activity_log (HEARTBEAT)',
      deletedRows: result.changes,
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
   * Clean signals older than retention period
   */
  private cleanSignals(): CleanupResult {
    const startTime = Date.now();
    const cutoffDate = this.getCutoffDate(this.config.signalRetentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM signals
      WHERE created_at < ?
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

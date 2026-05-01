import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { RSSCollectorService } from './rss';
import { GitHubCollectorService } from './github';
import { BlockchainCollectorService } from './blockchain';
import { SocialCollectorService } from './social';

export interface CollectorStatus {
  name: string;
  isRunning: boolean;
  sourceCount: number;
  lastActivity?: string;
}

export interface CollectorHealth {
  name: string;
  isRunning: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  consecutiveFailures: number;
  totalSuccesses: number;
  totalFailures: number;
  lastError: string | null;
  restartCount: number;
}

interface CollectorWrapper {
  name: string;
  collector: RSSCollectorService | GitHubCollectorService | BlockchainCollectorService | SocialCollectorService;
  start: () => void;
  stop: () => void;
  isHealthy: () => boolean;
}

export class SignalCollectorService {
  private db: Database.Database;
  private io: SocketServer;
  private rssCollector: RSSCollectorService;
  private githubCollector: GitHubCollectorService;
  private blockchainCollector: BlockchainCollectorService;
  private socialCollector: SocialCollectorService;
  private isRunning: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private collectorWrappers: CollectorWrapper[] = [];
  private healthState: Map<string, CollectorHealth> = new Map();

  // Configuration for health checks
  private static readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static readonly STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes max backoff

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.rssCollector = new RSSCollectorService(db, io);
    this.githubCollector = new GitHubCollectorService(db, io);
    this.blockchainCollector = new BlockchainCollectorService(db, io);
    this.socialCollector = new SocialCollectorService(db, io);

    // Initialize collector wrappers for health monitoring
    this.collectorWrappers = [
      {
        name: 'RSS',
        collector: this.rssCollector,
        start: () => this.rssCollector.start(),
        stop: () => this.rssCollector.stop(),
        isHealthy: () => this.rssCollector.getFeeds().length > 0,
      },
      {
        name: 'GitHub',
        collector: this.githubCollector,
        start: () => this.githubCollector.start(),
        stop: () => this.githubCollector.stop(),
        isHealthy: () => this.githubCollector.getRepos().length > 0,
      },
      {
        name: 'Blockchain',
        collector: this.blockchainCollector,
        start: () => this.blockchainCollector.start(),
        stop: () => this.blockchainCollector.stop(),
        isHealthy: () => this.blockchainCollector.getSources().length > 0,
      },
      {
        name: 'Social',
        collector: this.socialCollector,
        start: () => this.socialCollector.start(),
        stop: () => this.socialCollector.stop(),
        isHealthy: () => this.socialCollector.getSources().length > 0,
      },
    ];

    // Initialize health state for each collector
    this.initializeHealthState();
  }

  private initializeHealthState(): void {
    for (const wrapper of this.collectorWrappers) {
      // Load existing health state from DB or create new
      const existingHealth = this.db.prepare(
        'SELECT * FROM collector_health WHERE collector_name = ?'
      ).get(wrapper.name) as {
        collector_name: string;
        is_running: number;
        last_success_at: string | null;
        last_failure_at: string | null;
        consecutive_failures: number;
        total_successes: number;
        total_failures: number;
        last_error: string | null;
        restart_count: number;
      } | undefined;

      if (existingHealth) {
        this.healthState.set(wrapper.name, {
          name: existingHealth.collector_name,
          isRunning: existingHealth.is_running === 1,
          lastSuccessAt: existingHealth.last_success_at ? new Date(existingHealth.last_success_at) : null,
          lastFailureAt: existingHealth.last_failure_at ? new Date(existingHealth.last_failure_at) : null,
          consecutiveFailures: existingHealth.consecutive_failures,
          totalSuccesses: existingHealth.total_successes,
          totalFailures: existingHealth.total_failures,
          lastError: existingHealth.last_error,
          restartCount: existingHealth.restart_count,
        });
      } else {
        const newHealth: CollectorHealth = {
          name: wrapper.name,
          isRunning: false,
          lastSuccessAt: null,
          lastFailureAt: null,
          consecutiveFailures: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          lastError: null,
          restartCount: 0,
        };
        this.healthState.set(wrapper.name, newHealth);
        this.persistHealthState(wrapper.name);
      }
    }
  }

  private persistHealthState(collectorName: string): void {
    const health = this.healthState.get(collectorName);
    if (!health) return;

    this.db.prepare(`
      INSERT INTO collector_health (id, collector_name, is_running, last_success_at, last_failure_at,
        consecutive_failures, total_successes, total_failures, last_error, restart_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(collector_name) DO UPDATE SET
        is_running = excluded.is_running,
        last_success_at = excluded.last_success_at,
        last_failure_at = excluded.last_failure_at,
        consecutive_failures = excluded.consecutive_failures,
        total_successes = excluded.total_successes,
        total_failures = excluded.total_failures,
        last_error = excluded.last_error,
        restart_count = excluded.restart_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      uuidv4(),
      health.name,
      health.isRunning ? 1 : 0,
      health.lastSuccessAt?.toISOString() || null,
      health.lastFailureAt?.toISOString() || null,
      health.consecutiveFailures,
      health.totalSuccesses,
      health.totalFailures,
      health.lastError,
      health.restartCount
    );
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[SignalCollector] Starting all collectors...');

    for (const wrapper of this.collectorWrappers) {
      try {
        wrapper.start();
        this.recordSuccess(wrapper.name);
      } catch (error) {
        this.recordFailure(wrapper.name, error);
      }
    }

    // Start health check monitoring
    this.startHealthCheck();

    console.log('[SignalCollector] All collectors started with health monitoring');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    console.log('[SignalCollector] Stopping all collectors...');

    // Stop health check
    this.stopHealthCheck();

    for (const wrapper of this.collectorWrappers) {
      wrapper.stop();
      const health = this.healthState.get(wrapper.name);
      if (health) {
        health.isRunning = false;
        this.persistHealthState(wrapper.name);
      }
    }

    console.log('[SignalCollector] All collectors stopped');
  }

  /**
   * Start the health check interval
   */
  startHealthCheck(intervalMs: number = SignalCollectorService.HEALTH_CHECK_INTERVAL_MS): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck();
    }, intervalMs);

    console.log(`[SignalCollector] Health check started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop the health check interval
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Run health check for all collectors
   *
   * Each collector runs its own internal loop and doesn't call back into this
   * service per fetch, so we infer liveness from the signals table instead:
   * a collector is "healthy" if any of its sources wrote a row recently.
   * Without this, last_success_at would only reflect the boot moment and stay
   * frozen even though signals continue streaming in.
   */
  private runHealthCheck(): void {
    if (!this.isRunning) return;

    for (const wrapper of this.collectorWrappers) {
      const health = this.healthState.get(wrapper.name);
      if (!health) continue;

      // Verify with the signals table — did this collector's source prefix
      // produce any rows in the past 5 minutes? If yes, mark as success and
      // refresh last_success_at; if no, the existing state stands.
      try {
        const prefix = `${wrapper.name.toLowerCase()}:%`;
        const recent = this.db.prepare(`
          SELECT COUNT(*) as n FROM signals
          WHERE source LIKE ? AND created_at > datetime('now', '-5 minutes')
        `).get(prefix) as { n: number };
        if (recent.n > 0) {
          this.recordSuccess(wrapper.name);
        }
      } catch (err) {
        // signals query failure shouldn't break the health loop
        console.warn(`[SignalCollector] verify-by-signals failed for ${wrapper.name}:`, err);
      }

      // Check if collector is stale (no activity for too long)
      const isStale = health.lastSuccessAt &&
        (Date.now() - health.lastSuccessAt.getTime()) > SignalCollectorService.STALE_THRESHOLD_MS;

      // Check if too many consecutive failures
      const hasTooManyFailures = health.consecutiveFailures >= SignalCollectorService.MAX_CONSECUTIVE_FAILURES;

      if (isStale || hasTooManyFailures) {
        console.log(`[SignalCollector] Collector ${wrapper.name} needs restart: stale=${isStale}, failures=${health.consecutiveFailures}`);
        this.restartCollector(wrapper);
      }
    }

    // Emit health status event
    this.io.emit('collectors:health', {
      collectors: this.getAllHealth(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Restart a collector with exponential backoff
   */
  private restartCollector(wrapper: CollectorWrapper): void {
    const health = this.healthState.get(wrapper.name);
    if (!health) return;

    // Calculate backoff based on restart count
    const backoffMs = Math.min(
      Math.pow(2, health.restartCount) * 1000,
      SignalCollectorService.MAX_BACKOFF_MS
    );

    console.log(`[SignalCollector] Restarting ${wrapper.name} (attempt ${health.restartCount + 1}, backoff: ${backoffMs}ms)`);

    // Stop the collector
    try {
      wrapper.stop();
    } catch (error) {
      console.error(`[SignalCollector] Error stopping ${wrapper.name}:`, error);
    }

    // Wait for backoff period, then restart
    setTimeout(() => {
      if (!this.isRunning) return;

      try {
        wrapper.start();
        health.restartCount++;
        health.consecutiveFailures = 0;
        health.isRunning = true;
        this.persistHealthState(wrapper.name);

        console.log(`[SignalCollector] ${wrapper.name} restarted successfully`);

        // Log activity
        this.logActivity(wrapper.name, 'restarted', `Collector ${wrapper.name} restarted after ${health.restartCount} attempts`);

        // Emit restart event
        this.io.emit('collectors:restarted', {
          collector: wrapper.name,
          restartCount: health.restartCount,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.recordFailure(wrapper.name, error);
        console.error(`[SignalCollector] Failed to restart ${wrapper.name}:`, error);
      }
    }, backoffMs);
  }

  /**
   * Record a successful operation for a collector
   */
  recordSuccess(collectorName: string): void {
    const health = this.healthState.get(collectorName);
    if (!health) return;

    health.lastSuccessAt = new Date();
    health.consecutiveFailures = 0;
    health.totalSuccesses++;
    health.isRunning = true;
    this.persistHealthState(collectorName);
  }

  /**
   * Record a failure for a collector
   */
  recordFailure(collectorName: string, error: unknown): void {
    const health = this.healthState.get(collectorName);
    if (!health) return;

    health.lastFailureAt = new Date();
    health.consecutiveFailures++;
    health.totalFailures++;
    health.lastError = error instanceof Error ? error.message : String(error);
    this.persistHealthState(collectorName);
  }

  /**
   * Get health status for a specific collector
   */
  getHealth(collectorName: string): CollectorHealth | null {
    return this.healthState.get(collectorName) || null;
  }

  /**
   * Get health status for all collectors
   */
  getAllHealth(): CollectorHealth[] {
    return Array.from(this.healthState.values());
  }

  private logActivity(collectorName: string, action: string, message: string): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, 'COLLECTOR_HEALTH', 'info', ?, ?, ?)
    `).run(
      uuidv4(),
      new Date().toISOString(),
      message,
      JSON.stringify({ collector: collectorName, action })
    );
  }

  getStatus(): CollectorStatus[] {
    return [
      {
        name: 'RSS',
        isRunning: this.isRunning,
        sourceCount: this.rssCollector.getFeeds().length,
      },
      {
        name: 'GitHub',
        isRunning: this.isRunning,
        sourceCount: this.githubCollector.getRepos().length,
      },
      {
        name: 'Blockchain',
        isRunning: this.isRunning,
        sourceCount: this.blockchainCollector.getSources().length,
      },
      {
        name: 'Social',
        isRunning: this.isRunning,
        sourceCount: this.socialCollector.getSources().length,
      },
    ];
  }

  // Accessor methods for individual collectors
  getRSSCollector(): RSSCollectorService {
    return this.rssCollector;
  }

  getGitHubCollector(): GitHubCollectorService {
    return this.githubCollector;
  }

  getBlockchainCollector(): BlockchainCollectorService {
    return this.blockchainCollector;
  }

  getSocialCollector(): SocialCollectorService {
    return this.socialCollector;
  }

  // Get signal statistics
  getStats(): {
    total: number;
    today: number;
    bySource: Record<string, number>;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM signals').get() as any).count;

    const today = (this.db.prepare(`
      SELECT COUNT(*) as count FROM signals
      WHERE date(timestamp) = date('now')
    `).get() as any).count;

    const bySourceRows = this.db.prepare(`
      SELECT
        CASE
          WHEN source LIKE 'rss:%' THEN 'RSS'
          WHEN source LIKE 'github:%' THEN 'GitHub'
          WHEN source LIKE 'blockchain:%' THEN 'Blockchain'
          WHEN source LIKE 'social:%' THEN 'Social'
          ELSE 'Other'
        END as source_type,
        COUNT(*) as count
      FROM signals
      GROUP BY source_type
    `).all() as any[];

    const bySeverityRows = this.db.prepare(`
      SELECT severity, COUNT(*) as count
      FROM signals
      GROUP BY severity
    `).all() as any[];

    const byCategoryRows = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM signals
      GROUP BY category
    `).all() as any[];

    return {
      total,
      today,
      bySource: Object.fromEntries(bySourceRows.map(r => [r.source_type, r.count])),
      bySeverity: Object.fromEntries(bySeverityRows.map(r => [r.severity, r.count])),
      byCategory: Object.fromEntries(byCategoryRows.map(r => [r.category, r.count])),
    };
  }

  // Get recent signals
  getRecentSignals(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM signals
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  }

  // Get high priority signals
  getHighPrioritySignals(limit: number = 10): any[] {
    return this.db.prepare(`
      SELECT * FROM signals
      WHERE severity IN ('critical', 'high')
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  }
}

// Re-export individual collectors
export { RSSCollectorService } from './rss';
export { GitHubCollectorService } from './github';
export { BlockchainCollectorService } from './blockchain';
export { SocialCollectorService } from './social';

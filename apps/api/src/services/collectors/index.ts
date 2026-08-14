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
  /**
   * Table holding this collector's sources. Every collector stamps
   * `last_fetched` there on the success path of a fetch and leaves it
   * untouched when the fetch throws, which makes it the one honest liveness
   * signal available to this service.
   */
  sourceTable: string;
  start: () => void;
  stop: () => void;
  isHealthy: () => boolean;
}

export interface CollectorStaleness {
  name: string;
  isStale: boolean;
  lastFetchedAt: string | null;
  enabledSources: number;
  /** The window this verdict was measured against, in minutes. */
  thresholdMinutes: number;
  /** Null when the collector has never recorded a successful fetch. */
  minutesSinceFetch: number | null;
}

export interface CollectorLiveness {
  /** Newest successful fetch across the collector's enabled sources. */
  lastFetchedAt: string | null;
  /** Longest configured fetch interval, in minutes, among enabled sources. */
  maxIntervalMinutes: number | null;
  enabledSources: number;
}

/** A collector is stale once it has missed this many full fetch cycles. */
const STALE_CYCLE_MULTIPLIER = 2;
/**
 * Floor for the staleness window. start() defers its first fetch by 10-20s and
 * a full sweep of 40 GitHub repos is not instant, so a collector that has just
 * (re)started needs room before it can be called stale.
 */
const MIN_STALE_THRESHOLD_MS = 10 * 60 * 1000;
/** Ceiling, so a mis-entered interval can't disable staleness detection. */
const MAX_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Read a collector's liveness from its source table.
 *
 * Deliberately not derived from the signals table: signals are deduplicated on
 * insert, so a perfectly healthy fetch routinely writes zero rows and would
 * read as a failure.
 */
export function readCollectorLiveness(
  db: Database.Database,
  sourceTable: string
): CollectorLiveness {
  const row = db.prepare(`
    SELECT MAX(last_fetched) AS lastFetched,
           MAX(fetch_interval) AS maxInterval,
           COUNT(*) AS enabledSources
    FROM ${sourceTable}
    WHERE enabled = 1
  `).get() as { lastFetched: string | null; maxInterval: number | null; enabledSources: number };

  return {
    lastFetchedAt: row.lastFetched ?? null,
    maxIntervalMinutes: row.maxInterval ?? null,
    enabledSources: row.enabledSources ?? 0,
  };
}

/**
 * How long a collector may go without a successful fetch before it counts as
 * stale. Derived from the collector's own slowest source rather than fixed:
 * configured intervals span 5 to 120 minutes, so any single constant is either
 * too tight for the slow collectors or useless for the fast ones.
 */
export function staleThresholdMs(maxIntervalMinutes: number | null): number {
  const intervalMs = (maxIntervalMinutes ?? 0) * 60 * 1000;
  return Math.min(
    Math.max(intervalMs * STALE_CYCLE_MULTIPLIER, MIN_STALE_THRESHOLD_MS),
    MAX_STALE_THRESHOLD_MS
  );
}

/**
 * Whether a collector has gone quiet long enough to justify a restart.
 *
 * `serviceStartedAtMs` is the reference for a collector that has never
 * fetched, so a cold boot gets the same grace period as a running one instead
 * of being restarted on the first health check.
 */
export function isCollectorStale(
  liveness: CollectorLiveness,
  nowMs: number,
  serviceStartedAtMs: number
): boolean {
  // Nothing enabled means there is nothing to fetch — not a fault, and
  // restarting would never clear it.
  if (liveness.enabledSources === 0) return false;

  const lastFetchedMs = liveness.lastFetchedAt ? Date.parse(liveness.lastFetchedAt) : NaN;
  const reference = Number.isNaN(lastFetchedMs) ? serviceStartedAtMs : lastFetchedMs;

  return nowMs - reference > staleThresholdMs(liveness.maxIntervalMinutes);
}

export class SignalCollectorService {
  private db: Database.Database;
  private io: SocketServer;
  private rssCollector: RSSCollectorService;
  private githubCollector: GitHubCollectorService;
  private blockchainCollector: BlockchainCollectorService;
  private socialCollector: SocialCollectorService;
  private isRunning: boolean = false;
  private startedAtMs: number = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private collectorWrappers: CollectorWrapper[] = [];
  private healthState: Map<string, CollectorHealth> = new Map();
  /** Restarts awaiting their backoff, so health ticks can't queue duplicates. */
  private pendingRestarts: Map<string, NodeJS.Timeout> = new Map();
  /** Restarts since the last success, driving the backoff curve. */
  private consecutiveRestarts: Map<string, number> = new Map();

  // Configuration for health checks
  private static readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static readonly MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes max backoff
  /** Caps the backoff exponent so a long outage can't overflow to Infinity. */
  private static readonly MAX_BACKOFF_EXPONENT = 10;

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
        sourceTable: 'rss_feeds',
        start: () => this.rssCollector.start(),
        stop: () => this.rssCollector.stop(),
        isHealthy: () => this.rssCollector.getFeeds().length > 0,
      },
      {
        name: 'GitHub',
        collector: this.githubCollector,
        sourceTable: 'github_repos',
        start: () => this.githubCollector.start(),
        stop: () => this.githubCollector.stop(),
        isHealthy: () => this.githubCollector.getRepos().length > 0,
      },
      {
        name: 'Blockchain',
        collector: this.blockchainCollector,
        sourceTable: 'blockchain_sources',
        start: () => this.blockchainCollector.start(),
        stop: () => this.blockchainCollector.stop(),
        isHealthy: () => this.blockchainCollector.getSources().length > 0,
      },
      {
        name: 'Social',
        collector: this.socialCollector,
        sourceTable: 'social_sources',
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
        // Databases that lived through the restart-loop era (staleness judged
        // by a 5-minute signals window against 15-120 minute fetch intervals)
        // carry restart counts in the tens of thousands. Those numbers
        // describe the bug, not the collector, so shed them once on load
        // rather than reporting them forever.
        let restartCount = existingHealth.restart_count;
        if (restartCount > 10000) {
          console.log(`[SignalCollector] Resetting ${wrapper.name} restart_count (${restartCount} is restart-loop residue)`);
          restartCount = 0;
        }

        this.healthState.set(wrapper.name, {
          name: existingHealth.collector_name,
          isRunning: existingHealth.is_running === 1,
          lastSuccessAt: existingHealth.last_success_at ? new Date(existingHealth.last_success_at) : null,
          lastFailureAt: existingHealth.last_failure_at ? new Date(existingHealth.last_failure_at) : null,
          consecutiveFailures: existingHealth.consecutive_failures,
          totalSuccesses: existingHealth.total_successes,
          totalFailures: existingHealth.total_failures,
          lastError: existingHealth.last_error,
          restartCount,
        });
        if (restartCount !== existingHealth.restart_count) {
          this.persistHealthState(wrapper.name);
        }
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
    this.startedAtMs = Date.now();
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

    // Drop restarts still waiting on their backoff, so a stopped service can't
    // resurrect a collector after the fact.
    for (const timer of this.pendingRestarts.values()) clearTimeout(timer);
    this.pendingRestarts.clear();
    this.consecutiveRestarts.clear();

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
   * service per fetch, so liveness is inferred from the source tables'
   * `last_fetched`, which every collector stamps once a fetch has succeeded.
   *
   * It previously counted rows in the signals table over a fixed 5-minute
   * window instead. That misread every collector as permanently dead: signals
   * are deduplicated on insert, so a healthy fetch usually writes nothing, and
   * configured fetch intervals run 15-120 minutes — far outside the window.
   * Every collector was therefore restarted on every 30s tick, and since each
   * start() kicks off an immediate sweep of all its sources, the periodic
   * timers never survived long enough to fire and the sources were polled
   * ~17x more often than configured (CoinGecko answered with HTTP 429).
   */
  private runHealthCheck(): void {
    if (!this.isRunning) return;

    const now = Date.now();

    for (const wrapper of this.collectorWrappers) {
      const health = this.healthState.get(wrapper.name);
      if (!health) continue;

      let liveness: CollectorLiveness;
      try {
        liveness = readCollectorLiveness(this.db, wrapper.sourceTable);
      } catch (err) {
        // A liveness lookup failure says nothing about the collector itself,
        // so leave its state alone rather than restarting on a bad read.
        console.warn(`[SignalCollector] liveness lookup failed for ${wrapper.name}:`, err);
        continue;
      }

      // Advance last_success_at to the real fetch time, never past it.
      if (liveness.lastFetchedAt) {
        const fetchedAtMs = Date.parse(liveness.lastFetchedAt);
        const isNewer = !health.lastSuccessAt || fetchedAtMs > health.lastSuccessAt.getTime();
        if (!Number.isNaN(fetchedAtMs) && isNewer) {
          this.recordSuccess(wrapper.name, new Date(fetchedAtMs));
        }
      }

      const isStale = isCollectorStale(liveness, now, this.startedAtMs);
      const hasTooManyFailures = health.consecutiveFailures >= SignalCollectorService.MAX_CONSECUTIVE_FAILURES;

      if (isStale || hasTooManyFailures) {
        console.log(`[SignalCollector] Collector ${wrapper.name} needs restart: stale=${isStale}, failures=${health.consecutiveFailures}, lastFetched=${liveness.lastFetchedAt ?? 'never'}`);
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

    // A restart only takes effect once its backoff elapses, but the health
    // check keeps ticking every 30s in the meantime. Without this guard each
    // tick queued another restart, so stop()/start() churned continuously and
    // every start() re-triggered a full sweep of the collector's sources.
    if (this.pendingRestarts.has(wrapper.name)) return;

    // Backoff escalates per restart since the last success, not over the
    // lifetime restart count — the latter grows without bound, and 2^n
    // overflows to Infinity well before it means anything.
    const attempt = (this.consecutiveRestarts.get(wrapper.name) ?? 0) + 1;
    this.consecutiveRestarts.set(wrapper.name, attempt);

    const backoffMs = Math.min(
      Math.pow(2, Math.min(attempt - 1, SignalCollectorService.MAX_BACKOFF_EXPONENT)) * 1000,
      SignalCollectorService.MAX_BACKOFF_MS
    );

    console.log(`[SignalCollector] Restarting ${wrapper.name} (attempt ${attempt} since last success, backoff: ${backoffMs}ms)`);

    // Stop the collector
    try {
      wrapper.stop();
    } catch (error) {
      console.error(`[SignalCollector] Error stopping ${wrapper.name}:`, error);
    }

    // Wait for backoff period, then restart
    const timer = setTimeout(() => {
      this.pendingRestarts.delete(wrapper.name);
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

    this.pendingRestarts.set(wrapper.name, timer);
  }

  /**
   * Record a successful operation for a collector
   */
  recordSuccess(collectorName: string, at: Date = new Date()): void {
    const health = this.healthState.get(collectorName);
    if (!health) return;

    health.lastSuccessAt = at;
    health.consecutiveFailures = 0;
    health.totalSuccesses++;
    health.isRunning = true;
    // A success ends the current restart streak, so the next incident starts
    // its backoff from the bottom again.
    this.consecutiveRestarts.delete(collectorName);
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

  /**
   * Staleness verdict per collector, against the same window the health check
   * restarts on. Callers that surface "this collector has gone quiet" (alerts,
   * dashboards) must read it from here rather than re-deriving it from a fixed
   * interval — a second, tighter definition is what had the alerts endpoint
   * warning about collectors that were fetching exactly as configured.
   */
  getStaleness(): CollectorStaleness[] {
    const now = Date.now();

    return this.collectorWrappers.map(wrapper => {
      let liveness: CollectorLiveness;
      try {
        liveness = readCollectorLiveness(this.db, wrapper.sourceTable);
      } catch {
        liveness = { lastFetchedAt: null, maxIntervalMinutes: null, enabledSources: 0 };
      }

      const lastFetchedMs = liveness.lastFetchedAt ? Date.parse(liveness.lastFetchedAt) : NaN;

      return {
        name: wrapper.name,
        isStale: isCollectorStale(liveness, now, this.startedAtMs),
        lastFetchedAt: liveness.lastFetchedAt,
        enabledSources: liveness.enabledSources,
        thresholdMinutes: Math.round(staleThresholdMs(liveness.maxIntervalMinutes) / 60000),
        minutesSinceFetch: Number.isNaN(lastFetchedMs)
          ? null
          : Math.round((now - lastFetchedMs) / 60000),
      };
    });
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

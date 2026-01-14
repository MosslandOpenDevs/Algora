import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
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

export class SignalCollectorService {
  private db: Database.Database;
  private io: SocketServer;
  private rssCollector: RSSCollectorService;
  private githubCollector: GitHubCollectorService;
  private blockchainCollector: BlockchainCollectorService;
  private socialCollector: SocialCollectorService;
  private isRunning: boolean = false;

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.rssCollector = new RSSCollectorService(db, io);
    this.githubCollector = new GitHubCollectorService(db, io);
    this.blockchainCollector = new BlockchainCollectorService(db, io);
    this.socialCollector = new SocialCollectorService(db, io);
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[SignalCollector] Starting all collectors...');

    this.rssCollector.start();
    this.githubCollector.start();
    this.blockchainCollector.start();
    this.socialCollector.start();

    console.log('[SignalCollector] All collectors started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    console.log('[SignalCollector] Stopping all collectors...');

    this.rssCollector.stop();
    this.githubCollector.stop();
    this.blockchainCollector.stop();
    this.socialCollector.stop();

    console.log('[SignalCollector] All collectors stopped');
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

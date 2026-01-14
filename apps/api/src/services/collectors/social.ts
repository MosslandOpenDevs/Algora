import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// ===========================================
// Social Media Signal Collector for Algora
// ===========================================
// Collects signals from social media platforms:
// - Reddit (public JSON API)
// - Mastodon (public API)
// - Bluesky (public API)

interface SocialSource {
  id: string;
  platform: 'reddit' | 'mastodon' | 'bluesky';
  name: string;
  endpoint: string;
  category: string;
  enabled: boolean;
  lastFetched?: string;
  fetchInterval: number; // in minutes
}

interface SocialPost {
  id: string;
  author: string;
  content: string;
  url: string;
  timestamp: string;
  score?: number;
  replies?: number;
  platform: string;
}

interface Signal {
  id: string;
  original_id: string;
  source: string;
  timestamp: string;
  category: string;
  severity: string;
  value: number;
  unit: string;
  description: string;
  metadata: string | null;
}

export class SocialCollectorService {
  private db: Database.Database;
  private io: SocketServer;
  private sources: SocialSource[] = [];
  private intervalIds: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  // Keywords for relevance filtering
  private relevantKeywords = [
    // Governance
    'governance', 'dao', 'proposal', 'vote', 'voting', 'delegate', 'delegation',
    // Crypto/Blockchain
    'ethereum', 'blockchain', 'defi', 'web3', 'smart contract', 'token',
    // AI/Tech
    'ai governance', 'artificial intelligence', 'llm', 'machine learning',
    // Mossland specific
    'mossland', 'moss coin', 'moc', 'metaverse',
  ];

  // Default social media sources
  private defaultSources: Omit<SocialSource, 'id'>[] = [
    // === Reddit Sources ===
    {
      platform: 'reddit',
      name: 'r/ethereum',
      endpoint: 'https://www.reddit.com/r/ethereum/hot.json?limit=25',
      category: 'crypto',
      enabled: true,
      fetchInterval: 15,
    },
    {
      platform: 'reddit',
      name: 'r/CryptoCurrency',
      endpoint: 'https://www.reddit.com/r/CryptoCurrency/hot.json?limit=25',
      category: 'crypto',
      enabled: true,
      fetchInterval: 15,
    },
    {
      platform: 'reddit',
      name: 'r/defi',
      endpoint: 'https://www.reddit.com/r/defi/hot.json?limit=25',
      category: 'crypto',
      enabled: true,
      fetchInterval: 30,
    },
    {
      platform: 'reddit',
      name: 'r/ethdev',
      endpoint: 'https://www.reddit.com/r/ethdev/hot.json?limit=25',
      category: 'dev',
      enabled: true,
      fetchInterval: 30,
    },
    {
      platform: 'reddit',
      name: 'r/LocalLLaMA',
      endpoint: 'https://www.reddit.com/r/LocalLLaMA/hot.json?limit=25',
      category: 'ai',
      enabled: true,
      fetchInterval: 30,
    },
    {
      platform: 'reddit',
      name: 'r/artificial',
      endpoint: 'https://www.reddit.com/r/artificial/hot.json?limit=25',
      category: 'ai',
      enabled: true,
      fetchInterval: 30,
    },
    // === Mastodon Sources ===
    {
      platform: 'mastodon',
      name: 'infosec.exchange',
      endpoint: 'https://infosec.exchange/api/v1/timelines/public?limit=20&local=true',
      category: 'security',
      enabled: true,
      fetchInterval: 30,
    },
    {
      platform: 'mastodon',
      name: 'fosstodon.org',
      endpoint: 'https://fosstodon.org/api/v1/timelines/public?limit=20&local=true',
      category: 'dev',
      enabled: true,
      fetchInterval: 30,
    },
    // === Bluesky Sources ===
    {
      platform: 'bluesky',
      name: 'Bluesky Discover',
      endpoint: 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=ethereum+OR+blockchain+OR+governance&limit=25',
      category: 'crypto',
      enabled: true,
      fetchInterval: 30,
    },
    {
      platform: 'bluesky',
      name: 'Bluesky AI',
      endpoint: 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=artificial+intelligence+OR+LLM&limit=25',
      category: 'ai',
      enabled: true,
      fetchInterval: 30,
    },
  ];

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.initializeSources();
  }

  private initializeSources(): void {
    // Create social sources table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS social_sources (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_fetched TEXT,
        fetch_interval INTEGER DEFAULT 30,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Load existing sources
    const existingSources = this.db.prepare('SELECT * FROM social_sources').all() as any[];

    if (existingSources.length === 0) {
      // Seed default sources
      const insert = this.db.prepare(`
        INSERT INTO social_sources (id, platform, name, endpoint, category, enabled, fetch_interval)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const source of this.defaultSources) {
        insert.run(
          uuidv4(),
          source.platform,
          source.name,
          source.endpoint,
          source.category,
          source.enabled ? 1 : 0,
          source.fetchInterval
        );
      }

      console.log(`[Social] Seeded ${this.defaultSources.length} default sources`);
    }

    // Reload sources
    this.sources = this.db.prepare('SELECT * FROM social_sources WHERE enabled = 1').all().map((row: any) => ({
      id: row.id,
      platform: row.platform,
      name: row.name,
      endpoint: row.endpoint,
      category: row.category,
      enabled: row.enabled === 1,
      lastFetched: row.last_fetched,
      fetchInterval: row.fetch_interval,
    }));
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Social] Collector started with ${this.sources.length} sources`);

    // Start collectors for each source
    for (const source of this.sources) {
      this.startSourceCollector(source);
    }

    // Initial fetch after 15 seconds (stagger with other collectors)
    setTimeout(() => this.fetchAllSources(), 15000);
  }

  stop(): void {
    this.isRunning = false;

    // Clear all intervals
    for (const [sourceId, intervalId] of this.intervalIds) {
      clearInterval(intervalId);
      this.intervalIds.delete(sourceId);
    }

    console.log('[Social] Collector stopped');
  }

  private startSourceCollector(source: SocialSource): void {
    if (this.intervalIds.has(source.id)) {
      clearInterval(this.intervalIds.get(source.id)!);
    }

    const intervalMs = source.fetchInterval * 60 * 1000;
    const intervalId = setInterval(() => this.fetchSource(source), intervalMs);
    this.intervalIds.set(source.id, intervalId);
  }

  private async fetchAllSources(): Promise<void> {
    for (const source of this.sources) {
      await this.fetchSource(source);
      // Small delay between sources to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async fetchSource(source: SocialSource): Promise<number> {
    try {
      console.log(`[Social] Fetching: ${source.name}`);

      let posts: SocialPost[] = [];

      switch (source.platform) {
        case 'reddit':
          posts = await this.fetchReddit(source);
          break;
        case 'mastodon':
          posts = await this.fetchMastodon(source);
          break;
        case 'bluesky':
          posts = await this.fetchBluesky(source);
          break;
      }

      let newSignals = 0;

      for (const post of posts) {
        // Filter for relevance
        if (!this.isRelevant(post)) continue;

        const created = await this.processPost(source, post);
        if (created) newSignals++;
      }

      // Update last fetched time
      this.db.prepare('UPDATE social_sources SET last_fetched = ? WHERE id = ?')
        .run(new Date().toISOString(), source.id);

      if (newSignals > 0) {
        console.log(`[Social] ${source.name}: ${newSignals} new signals`);
        this.logActivity(source.name, newSignals);
      }

      return newSignals;
    } catch (error) {
      console.error(`[Social] Error fetching ${source.name}:`, error instanceof Error ? error.message : String(error));
      return 0;
    }
  }

  private async fetchReddit(source: SocialSource): Promise<SocialPost[]> {
    const response = await fetch(source.endpoint, {
      headers: {
        'User-Agent': 'Algora/1.0 Governance Signal Collector',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    interface RedditPost {
      id: string;
      author: string;
      title: string;
      selftext?: string;
      permalink: string;
      created_utc: number;
      score: number;
      num_comments: number;
    }
    const data = await response.json() as {
      data?: { children?: Array<{ data: RedditPost }> };
    };
    const posts: SocialPost[] = [];

    if (data.data?.children) {
      for (const child of data.data.children) {
        const post = child.data;
        posts.push({
          id: post.id,
          author: post.author,
          content: post.title + (post.selftext ? '\n\n' + post.selftext : ''),
          url: `https://reddit.com${post.permalink}`,
          timestamp: new Date(post.created_utc * 1000).toISOString(),
          score: post.score,
          replies: post.num_comments,
          platform: 'reddit',
        });
      }
    }

    return posts;
  }

  private async fetchMastodon(source: SocialSource): Promise<SocialPost[]> {
    const response = await fetch(source.endpoint, {
      headers: {
        'User-Agent': 'Algora/1.0 Governance Signal Collector',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const posts: SocialPost[] = [];

    if (Array.isArray(data)) {
      for (const status of data) {
        // Strip HTML tags from content
        const content = status.content?.replace(/<[^>]*>/g, '') || '';
        posts.push({
          id: status.id,
          author: status.account?.acct || 'unknown',
          content,
          url: status.url,
          timestamp: status.created_at,
          score: status.favourites_count,
          replies: status.replies_count,
          platform: 'mastodon',
        });
      }
    }

    return posts;
  }

  private async fetchBluesky(source: SocialSource): Promise<SocialPost[]> {
    const response = await fetch(source.endpoint, {
      headers: {
        'User-Agent': 'Algora/1.0 Governance Signal Collector',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as {
      posts?: Array<{
        uri: string;
        author?: { handle?: string };
        record?: { text?: string; createdAt?: string };
        likeCount?: number;
        replyCount?: number;
      }>;
    };
    const posts: SocialPost[] = [];

    if (data.posts && Array.isArray(data.posts)) {
      for (const item of data.posts) {
        const record = item.record;
        posts.push({
          id: item.uri,
          author: item.author?.handle || 'unknown',
          content: record?.text || '',
          url: `https://bsky.app/profile/${item.author?.handle}/post/${item.uri.split('/').pop()}`,
          timestamp: record?.createdAt || new Date().toISOString(),
          score: item.likeCount,
          replies: item.replyCount,
          platform: 'bluesky',
        });
      }
    }

    return posts;
  }

  private isRelevant(post: SocialPost): boolean {
    const text = (post.content + ' ' + post.author).toLowerCase();
    return this.relevantKeywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  private async processPost(source: SocialSource, post: SocialPost): Promise<boolean> {
    const originalId = `${source.platform}:${post.id}`;

    // Check if already exists
    const existing = this.db.prepare(
      'SELECT id FROM signals WHERE original_id = ?'
    ).get(originalId);

    if (existing) return false;

    // Calculate severity based on engagement
    const severity = this.calculateSeverity(post);

    // Create signal
    const signal: Signal = {
      id: uuidv4(),
      original_id: originalId,
      source: `social:${source.platform}:${source.name}`,
      timestamp: post.timestamp,
      category: source.category,
      severity,
      value: post.score || 0,
      unit: 'engagement',
      description: this.truncate(post.content, 500),
      metadata: JSON.stringify({
        platform: post.platform,
        author: post.author,
        url: post.url,
        score: post.score,
        replies: post.replies,
        sourceName: source.name,
      }),
    };

    // Insert signal
    this.db.prepare(`
      INSERT INTO signals (id, original_id, source, timestamp, category, severity, value, unit, description, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      signal.id,
      signal.original_id,
      signal.source,
      signal.timestamp,
      signal.category,
      signal.severity,
      signal.value,
      signal.unit,
      signal.description,
      signal.metadata
    );

    // Emit signal event
    this.io.emit('signals:collected', { signal });

    return true;
  }

  private calculateSeverity(post: SocialPost): string {
    const score = post.score || 0;
    const replies = post.replies || 0;
    const engagement = score + replies * 2;

    if (engagement > 1000) return 'critical';
    if (engagement > 500) return 'high';
    if (engagement > 100) return 'medium';
    return 'low';
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private logActivity(sourceName: string, count: number): void {
    try {
      this.db.prepare(`
        INSERT INTO activity_log (id, source, level, message, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        'SOCIAL_COLLECTOR',
        'info',
        `Collected ${count} signals from ${sourceName}`,
        JSON.stringify({ source: sourceName, signalCount: count }),
        new Date().toISOString()
      );
    } catch {
      // Activity log is optional
    }
  }

  // === Public API Methods ===

  getSources(): SocialSource[] {
    return [...this.sources];
  }

  addSource(source: Omit<SocialSource, 'id'>): SocialSource {
    const id = uuidv4();
    const newSource: SocialSource = { id, ...source };

    this.db.prepare(`
      INSERT INTO social_sources (id, platform, name, endpoint, category, enabled, fetch_interval)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source.platform,
      source.name,
      source.endpoint,
      source.category,
      source.enabled ? 1 : 0,
      source.fetchInterval
    );

    this.sources.push(newSource);

    if (this.isRunning && source.enabled) {
      this.startSourceCollector(newSource);
    }

    return newSource;
  }

  removeSource(id: string): boolean {
    const index = this.sources.findIndex(s => s.id === id);
    if (index === -1) return false;

    // Stop collector
    if (this.intervalIds.has(id)) {
      clearInterval(this.intervalIds.get(id)!);
      this.intervalIds.delete(id);
    }

    // Remove from database
    this.db.prepare('DELETE FROM social_sources WHERE id = ?').run(id);

    // Remove from array
    this.sources.splice(index, 1);

    return true;
  }

  enableSource(id: string): boolean {
    const source = this.sources.find(s => s.id === id);
    if (!source) return false;

    source.enabled = true;
    this.db.prepare('UPDATE social_sources SET enabled = 1 WHERE id = ?').run(id);

    if (this.isRunning) {
      this.startSourceCollector(source);
    }

    return true;
  }

  disableSource(id: string): boolean {
    const source = this.sources.find(s => s.id === id);
    if (!source) return false;

    source.enabled = false;
    this.db.prepare('UPDATE social_sources SET enabled = 0 WHERE id = ?').run(id);

    if (this.intervalIds.has(id)) {
      clearInterval(this.intervalIds.get(id)!);
      this.intervalIds.delete(id);
    }

    return true;
  }

  getStats(): {
    totalSources: number;
    enabledSources: number;
    byPlatform: Record<string, number>;
  } {
    const byPlatform: Record<string, number> = {};
    let enabledCount = 0;

    for (const source of this.sources) {
      byPlatform[source.platform] = (byPlatform[source.platform] || 0) + 1;
      if (source.enabled) enabledCount++;
    }

    return {
      totalSources: this.sources.length,
      enabledSources: enabledCount,
      byPlatform,
    };
  }
}

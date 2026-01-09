import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface GitHubRepo {
  id: string;
  owner: string;
  repo: string;
  category: string;
  enabled: boolean;
  lastFetched?: string;
  fetchInterval: number; // in minutes
}

interface GitHubEvent {
  id: string;
  type: string;
  actor: {
    login: string;
  };
  repo: {
    name: string;
  };
  payload: any;
  created_at: string;
}

export class GitHubCollectorService {
  private db: Database.Database;
  private io: SocketServer;
  private repos: GitHubRepo[] = [];
  private intervalIds: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private apiToken: string | null = null;

  // Default repositories across multiple categories
  private defaultRepos: Omit<GitHubRepo, 'id'>[] = [
    // === Protocol & Governance ===
    {
      owner: 'ethereum',
      repo: 'EIPs',
      category: 'protocol',
      enabled: true,
      fetchInterval: 30,
    },
    {
      owner: 'ethereum',
      repo: 'pm',
      category: 'governance',
      enabled: true,
      fetchInterval: 30,
    },
    {
      owner: 'ethereum',
      repo: 'go-ethereum',
      category: 'protocol',
      enabled: true,
      fetchInterval: 60,
    },
    // === DeFi ===
    {
      owner: 'Uniswap',
      repo: 'v3-core',
      category: 'defi',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'aave',
      repo: 'aave-v3-core',
      category: 'defi',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'compound-finance',
      repo: 'compound-protocol',
      category: 'defi',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'MakerDAO',
      repo: 'community',
      category: 'governance',
      enabled: true,
      fetchInterval: 60,
    },
    // === Security ===
    {
      owner: 'OpenZeppelin',
      repo: 'openzeppelin-contracts',
      category: 'security',
      enabled: true,
      fetchInterval: 60,
    },
    // === AI/ML ===
    {
      owner: 'langchain-ai',
      repo: 'langchain',
      category: 'ai',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'huggingface',
      repo: 'transformers',
      category: 'ai',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'ollama',
      repo: 'ollama',
      category: 'ai',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'openai',
      repo: 'openai-cookbook',
      category: 'ai',
      enabled: true,
      fetchInterval: 60,
    },
    // === Development Tools ===
    {
      owner: 'vercel',
      repo: 'next.js',
      category: 'dev',
      enabled: true,
      fetchInterval: 60,
    },
    {
      owner: 'microsoft',
      repo: 'TypeScript',
      category: 'dev',
      enabled: true,
      fetchInterval: 60,
    },
    // === Mossland - All Public Repos (27 repos) ===
    // AI & Research
    { owner: 'mossland', repo: 'MosslandAI', category: 'mossland-ai', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'MossCoin_AI_NFT_Research', category: 'mossland-ai', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'agentic-orchestrator', category: 'mossland-ai', enabled: true, fetchInterval: 60 },
    // Governance & Platform
    { owner: 'mossland', repo: 'MossDAO', category: 'mossland-governance', enabled: true, fetchInterval: 30 },
    { owner: 'mossland', repo: 'Agora', category: 'mossland-governance', enabled: true, fetchInterval: 30 },
    { owner: 'mossland', repo: 'Algora', category: 'mossland-governance', enabled: true, fetchInterval: 30 },
    // Metaverse & XR
    { owner: 'mossland', repo: 'mossverse', category: 'mossland-metaverse', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'MosslandXR', category: 'mossland-metaverse', enabled: true, fetchInterval: 60 },
    // Token & Coin
    { owner: 'mossland', repo: 'MossCoin', category: 'mossland-token', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'MossCoin-ERC20-2025', category: 'mossland-token', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'MossCoinForMachine', category: 'mossland-token', enabled: true, fetchInterval: 60 },
    // Bridge & DeFi
    { owner: 'mossland', repo: 'bridge-2026', category: 'mossland-defi', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'mossland_swap', category: 'mossland-defi', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'doubleDice', category: 'mossland-defi', enabled: true, fetchInterval: 60 },
    // Games
    { owner: 'mossland', repo: 'basebat_game', category: 'mossland-game', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'MocoRush', category: 'mossland-game', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'you-quiz-moss-meta', category: 'mossland-game', enabled: true, fetchInterval: 60 },
    { owner: 'mossland', repo: 'zendog', category: 'mossland-game', enabled: true, fetchInterval: 60 },
    // Infrastructure
    { owner: 'mossland', repo: 'mossland-nexus', category: 'mossland-infra', enabled: true, fetchInterval: 60 },
    // Disclosure & Materials
    { owner: 'mossland', repo: 'Disclosure-and-Materials', category: 'mossland-disclosure', enabled: true, fetchInterval: 120 },
    { owner: 'mossland', repo: 'mossland_disclosure_web', category: 'mossland-disclosure', enabled: true, fetchInterval: 120 },
    // Developer & Community
    { owner: 'mossland', repo: 'MosslandDeveloperSupportProgram', category: 'mossland-dev', enabled: true, fetchInterval: 120 },
    { owner: 'mossland', repo: 'Hackathon', category: 'mossland-dev', enabled: true, fetchInterval: 120 },
    { owner: 'mossland', repo: 'Projects', category: 'mossland-dev', enabled: true, fetchInterval: 120 },
    // Brand & Art
    { owner: 'mossland', repo: 'Brand-Identity', category: 'mossland-brand', enabled: true, fetchInterval: 120 },
    { owner: 'mossland', repo: 'art_resource', category: 'mossland-brand', enabled: true, fetchInterval: 120 },
    { owner: 'mossland', repo: 'The-Story-of-CyberTHUG', category: 'mossland-brand', enabled: true, fetchInterval: 120 },
  ];

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.apiToken = process.env.GITHUB_TOKEN || null;
    this.initializeRepos();
  }

  private initializeRepos(): void {
    // Create GitHub repos table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS github_repos (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        category TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_fetched TEXT,
        fetch_interval INTEGER DEFAULT 30,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner, repo)
      )
    `);

    // Load existing repos
    const existingRepos = this.db.prepare('SELECT * FROM github_repos').all() as any[];

    if (existingRepos.length === 0) {
      // Seed default repos
      const insert = this.db.prepare(`
        INSERT INTO github_repos (id, owner, repo, category, enabled, fetch_interval)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const r of this.defaultRepos) {
        insert.run(uuidv4(), r.owner, r.repo, r.category, r.enabled ? 1 : 0, r.fetchInterval);
      }

      console.log(`[GitHub] Seeded ${this.defaultRepos.length} default repos`);
    }

    // Reload repos
    this.repos = this.db.prepare('SELECT * FROM github_repos WHERE enabled = 1').all().map((row: any) => ({
      id: row.id,
      owner: row.owner,
      repo: row.repo,
      category: row.category,
      enabled: row.enabled === 1,
      lastFetched: row.last_fetched,
      fetchInterval: row.fetch_interval,
    }));
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[GitHub] Collector started with ${this.repos.length} repos (token: ${this.apiToken ? 'configured' : 'not configured'})`);

    // Start collectors for each repo
    for (const repo of this.repos) {
      this.startRepoCollector(repo);
    }

    // Initial fetch after 15 seconds
    setTimeout(() => this.fetchAllRepos(), 15000);
  }

  stop(): void {
    this.isRunning = false;

    for (const [repoId, intervalId] of this.intervalIds) {
      clearInterval(intervalId);
      this.intervalIds.delete(repoId);
    }

    console.log('[GitHub] Collector stopped');
  }

  private startRepoCollector(repo: GitHubRepo): void {
    if (this.intervalIds.has(repo.id)) {
      clearInterval(this.intervalIds.get(repo.id)!);
    }

    const intervalMs = repo.fetchInterval * 60 * 1000;
    const intervalId = setInterval(() => this.fetchRepo(repo), intervalMs);
    this.intervalIds.set(repo.id, intervalId);
  }

  private async fetchAllRepos(): Promise<void> {
    for (const repo of this.repos) {
      await this.fetchRepo(repo);
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async fetchRepo(repo: GitHubRepo): Promise<number> {
    try {
      console.log(`[GitHub] Fetching: ${repo.owner}/${repo.repo}`);

      // Fetch recent events
      const events = await this.fetchEvents(repo);
      let newSignals = 0;

      for (const event of events) {
        const created = await this.processEvent(repo, event);
        if (created) newSignals++;
      }

      // Fetch recent issues and PRs
      const issues = await this.fetchIssues(repo);
      for (const issue of issues) {
        const created = await this.processIssue(repo, issue);
        if (created) newSignals++;
      }

      // Update last fetched time
      this.db.prepare('UPDATE github_repos SET last_fetched = ? WHERE id = ?')
        .run(new Date().toISOString(), repo.id);

      if (newSignals > 0) {
        console.log(`[GitHub] ${repo.owner}/${repo.repo}: ${newSignals} new signals`);
        this.logActivity(repo, newSignals);
      }

      return newSignals;
    } catch (error) {
      console.error(`[GitHub] Error fetching ${repo.owner}/${repo.repo}:`, error);
      return 0;
    }
  }

  private async fetchEvents(repo: GitHubRepo): Promise<GitHubEvent[]> {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/events?per_page=30`;

    const headers: Record<string, string> = {
      'User-Agent': 'Algora/1.0 Governance Signal Collector',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (this.apiToken) {
      headers['Authorization'] = `token ${this.apiToken}`;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.warn('[GitHub] Rate limit exceeded');
        return [];
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  private async fetchIssues(repo: GitHubRepo): Promise<any[]> {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues?state=all&sort=updated&per_page=20`;

    const headers: Record<string, string> = {
      'User-Agent': 'Algora/1.0 Governance Signal Collector',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (this.apiToken) {
      headers['Authorization'] = `token ${this.apiToken}`;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  }

  private async processEvent(repo: GitHubRepo, event: GitHubEvent): Promise<boolean> {
    // Filter relevant event types
    const relevantTypes = [
      'PushEvent',
      'PullRequestEvent',
      'IssuesEvent',
      'IssueCommentEvent',
      'ReleaseEvent',
      'CreateEvent',
    ];

    if (!relevantTypes.includes(event.type)) {
      return false;
    }

    const originalId = `github:event:${event.id}`;

    // Check if signal already exists
    const existing = this.db.prepare(
      'SELECT id FROM signals WHERE original_id = ?'
    ).get(originalId);

    if (existing) {
      return false;
    }

    const { description, severity } = this.formatEvent(event);

    const signal = {
      id: uuidv4(),
      original_id: originalId,
      source: `github:${repo.owner}/${repo.repo}`,
      timestamp: event.created_at,
      category: repo.category,
      severity,
      value: 1,
      unit: 'event',
      description,
      metadata: JSON.stringify({
        eventType: event.type,
        actor: event.actor.login,
        repo: `${repo.owner}/${repo.repo}`,
        payload: this.sanitizePayload(event.payload),
      }),
    };

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

    this.io.emit('signals:collected', { signal });

    return true;
  }

  private async processIssue(repo: GitHubRepo, issue: any): Promise<boolean> {
    const originalId = `github:issue:${repo.owner}/${repo.repo}#${issue.number}`;

    // Check if signal already exists
    const existing = this.db.prepare(
      'SELECT id FROM signals WHERE original_id = ?'
    ).get(originalId);

    if (existing) {
      return false;
    }

    const isPR = !!issue.pull_request;
    const severity = this.determineIssueSeverity(issue);

    const signal = {
      id: uuidv4(),
      original_id: originalId,
      source: `github:${repo.owner}/${repo.repo}`,
      timestamp: issue.created_at,
      category: repo.category,
      severity,
      value: 1,
      unit: isPR ? 'pull_request' : 'issue',
      description: `[${isPR ? 'PR' : 'Issue'}] ${issue.title}\n\n${(issue.body || '').substring(0, 500)}`,
      metadata: JSON.stringify({
        number: issue.number,
        state: issue.state,
        isPullRequest: isPR,
        labels: issue.labels?.map((l: any) => l.name) || [],
        author: issue.user?.login,
        url: issue.html_url,
      }),
    };

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

    this.io.emit('signals:collected', { signal });

    return true;
  }

  private formatEvent(event: GitHubEvent): { description: string; severity: string } {
    const actor = event.actor.login;
    let description = '';
    let severity = 'low';

    switch (event.type) {
      case 'PushEvent':
        const commits = event.payload.commits?.length || 0;
        description = `${actor} pushed ${commits} commit(s) to ${event.payload.ref}`;
        severity = commits > 5 ? 'medium' : 'low';
        break;

      case 'PullRequestEvent':
        const prAction = event.payload.action;
        const prTitle = event.payload.pull_request?.title || 'Unknown';
        description = `${actor} ${prAction} PR: ${prTitle}`;
        severity = prAction === 'opened' ? 'medium' : 'low';
        break;

      case 'IssuesEvent':
        const issueAction = event.payload.action;
        const issueTitle = event.payload.issue?.title || 'Unknown';
        description = `${actor} ${issueAction} issue: ${issueTitle}`;
        severity = issueAction === 'opened' ? 'medium' : 'low';
        break;

      case 'ReleaseEvent':
        const releaseName = event.payload.release?.name || event.payload.release?.tag_name || 'Unknown';
        description = `${actor} released: ${releaseName}`;
        severity = 'high';
        break;

      case 'CreateEvent':
        const refType = event.payload.ref_type;
        const ref = event.payload.ref || '';
        description = `${actor} created ${refType}: ${ref}`;
        severity = refType === 'tag' ? 'medium' : 'low';
        break;

      default:
        description = `${actor} performed ${event.type}`;
    }

    return { description, severity };
  }

  private determineIssueSeverity(issue: any): string {
    const labels = issue.labels?.map((l: any) => l.name.toLowerCase()) || [];
    const title = issue.title?.toLowerCase() || '';

    if (labels.includes('critical') || labels.includes('security')) return 'critical';
    if (labels.includes('high') || labels.includes('urgent') || labels.includes('bug')) return 'high';
    if (labels.includes('enhancement') || labels.includes('feature')) return 'medium';
    if (title.includes('breaking') || title.includes('security')) return 'high';

    return 'low';
  }

  private sanitizePayload(payload: any): any {
    // Remove large or sensitive data from payload
    const sanitized = { ...payload };
    delete sanitized.commits; // Can be large
    delete sanitized.head;
    delete sanitized.base;
    return sanitized;
  }

  private logActivity(repo: GitHubRepo, count: number): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, 'COLLECTOR', 'info', ?, ?, ?)
    `).run(
      uuidv4(),
      new Date().toISOString(),
      `GitHub: ${repo.owner}/${repo.repo} collected ${count} signals`,
      JSON.stringify({ source: 'github', repo: `${repo.owner}/${repo.repo}`, count })
    );
  }

  // Management methods
  addRepo(repo: Omit<GitHubRepo, 'id'>): GitHubRepo {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO github_repos (id, owner, repo, category, enabled, fetch_interval)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, repo.owner, repo.repo, repo.category, repo.enabled ? 1 : 0, repo.fetchInterval);

    const newRepo = { ...repo, id };
    this.repos.push(newRepo);

    if (this.isRunning && repo.enabled) {
      this.startRepoCollector(newRepo);
    }

    return newRepo;
  }

  removeRepo(repoId: string): boolean {
    const intervalId = this.intervalIds.get(repoId);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalIds.delete(repoId);
    }

    this.db.prepare('DELETE FROM github_repos WHERE id = ?').run(repoId);
    this.repos = this.repos.filter(r => r.id !== repoId);

    return true;
  }

  getRepos(): GitHubRepo[] {
    return this.repos;
  }
}

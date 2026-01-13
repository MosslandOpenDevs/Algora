import type Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { llmService, type ModelComplexity } from './llm';
import { AgoraService } from './agora';
import type { GovernanceOSBridge } from './governance-os-bridge';

// Issue detection patterns
interface DetectionPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  conditions: PatternCondition[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  cooldownMinutes: number; // Prevent duplicate detection
}

interface PatternCondition {
  type: 'keyword' | 'severity' | 'frequency' | 'source' | 'category';
  operator: 'contains' | 'equals' | 'gte' | 'lte' | 'in';
  value: string | number | string[];
  timeWindowMinutes?: number;
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

interface Issue {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  signal_ids: string;
  evidence: string;
  suggested_actions: string;
}

interface AlertThreshold {
  id: string;
  name: string;
  category: string;
  severity: string;
  threshold: number;
  timeWindowMinutes: number;
  enabled: boolean;
}

export class IssueDetectionService {
  private db: Database.Database;
  private io: SocketServer;
  private agoraService: AgoraService;
  private governanceOSBridge: GovernanceOSBridge | null = null;
  private isRunning: boolean = false;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private lastPatternTrigger: Map<string, Date> = new Map();
  private lastAutoAgoraSession: Map<string, Date> = new Map();

  // Predefined detection patterns
  private patterns: DetectionPattern[] = [
    // Security patterns
    {
      id: 'security-breach',
      name: 'Security Breach Alert',
      description: 'Detects potential security breaches from multiple sources',
      category: 'security',
      conditions: [
        { type: 'severity', operator: 'equals', value: 'critical' },
        { type: 'keyword', operator: 'contains', value: 'hack|exploit|breach|vulnerability' },
      ],
      priority: 'critical',
      cooldownMinutes: 30,
    },
    {
      id: 'smart-contract-vulnerability',
      name: 'Smart Contract Vulnerability',
      description: 'Detects smart contract related security issues',
      category: 'security',
      conditions: [
        { type: 'keyword', operator: 'contains', value: 'contract|solidity|reentrancy|overflow' },
        { type: 'severity', operator: 'in', value: ['critical', 'high'] },
      ],
      priority: 'critical',
      cooldownMinutes: 60,
    },
    // Market patterns
    {
      id: 'price-crash',
      name: 'Significant Price Drop',
      description: 'Detects major price movements',
      category: 'market',
      conditions: [
        { type: 'category', operator: 'equals', value: 'market' },
        { type: 'keyword', operator: 'contains', value: 'down|crash|drop|plunge' },
        { type: 'severity', operator: 'in', value: ['critical', 'high'] },
      ],
      priority: 'high',
      cooldownMinutes: 60,
    },
    {
      id: 'fear-extreme',
      name: 'Extreme Fear Index',
      description: 'Fear & Greed Index showing extreme fear',
      category: 'market',
      conditions: [
        { type: 'source', operator: 'contains', value: 'Fear & Greed' },
        { type: 'keyword', operator: 'contains', value: 'Extreme Fear' },
      ],
      priority: 'high',
      cooldownMinutes: 240,
    },
    // Governance patterns
    {
      id: 'governance-proposal',
      name: 'New Governance Proposal',
      description: 'Detects new proposals requiring attention',
      category: 'governance',
      conditions: [
        { type: 'category', operator: 'in', value: ['governance', 'protocol'] },
        { type: 'keyword', operator: 'contains', value: 'proposal|vote|governance|EIP' },
      ],
      priority: 'medium',
      cooldownMinutes: 120,
    },
    {
      id: 'protocol-upgrade',
      name: 'Protocol Upgrade',
      description: 'Detects protocol upgrades and hard forks',
      category: 'protocol',
      conditions: [
        { type: 'keyword', operator: 'contains', value: 'upgrade|fork|release|v[0-9]' },
        { type: 'category', operator: 'in', value: ['protocol', 'dev'] },
      ],
      priority: 'medium',
      cooldownMinutes: 60,
    },
    // DeFi patterns
    {
      id: 'tvl-drop',
      name: 'TVL Significant Drop',
      description: 'Detects major TVL changes in DeFi protocols',
      category: 'defi',
      conditions: [
        { type: 'category', operator: 'equals', value: 'defi' },
        { type: 'keyword', operator: 'contains', value: 'decreased|down|drop' },
        { type: 'severity', operator: 'in', value: ['high', 'critical'] },
      ],
      priority: 'high',
      cooldownMinutes: 120,
    },
    // Mossland specific patterns
    {
      id: 'mossland-update',
      name: 'Mossland Project Update',
      description: 'Detects significant updates to Mossland projects',
      category: 'mossland',
      conditions: [
        { type: 'source', operator: 'contains', value: 'mossland' },
        { type: 'keyword', operator: 'contains', value: 'release|merge|update|PR' },
      ],
      priority: 'medium',
      cooldownMinutes: 30,
    },
    {
      id: 'mossland-governance',
      name: 'Mossland Governance Activity',
      description: 'Detects governance related activity in Mossland',
      category: 'mossland-governance',
      conditions: [
        { type: 'category', operator: 'in', value: ['mossland-governance', 'mossland-token'] },
      ],
      priority: 'high',
      cooldownMinutes: 30,
    },
    // AI patterns
    {
      id: 'ai-breakthrough',
      name: 'AI Research Breakthrough',
      description: 'Detects significant AI research announcements',
      category: 'ai',
      conditions: [
        { type: 'category', operator: 'equals', value: 'ai' },
        { type: 'keyword', operator: 'contains', value: 'breakthrough|GPT|Claude|model|training' },
        { type: 'severity', operator: 'in', value: ['high', 'medium'] },
      ],
      priority: 'medium',
      cooldownMinutes: 120,
    },
  ];

  // Alert thresholds for frequency-based detection
  private alertThresholds: AlertThreshold[] = [
    {
      id: 'critical-surge',
      name: 'Critical Signal Surge',
      category: '*',
      severity: 'critical',
      threshold: 3,
      timeWindowMinutes: 60,
      enabled: true,
    },
    {
      id: 'high-frequency',
      name: 'High Severity Frequency Alert',
      category: '*',
      severity: 'high',
      threshold: 10,
      timeWindowMinutes: 60,
      enabled: true,
    },
    {
      id: 'security-alert',
      name: 'Security Alert Threshold',
      category: 'security',
      severity: '*',
      threshold: 5,
      timeWindowMinutes: 30,
      enabled: true,
    },
  ];

  constructor(db: Database.Database, io: SocketServer) {
    this.db = db;
    this.io = io;
    this.agoraService = new AgoraService(db, io);
    this.initializeTables();
  }

  /**
   * Set the GovernanceOS Bridge for direct pipeline triggering
   */
  setGovernanceOSBridge(bridge: GovernanceOSBridge): void {
    this.governanceOSBridge = bridge;
    console.info('[IssueDetection] GovernanceOS Bridge connected');
  }

  private initializeTables(): void {
    // Create issue_signals junction table for signal-to-issue correlation
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issue_signals (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        signal_id TEXT NOT NULL,
        relevance_score REAL DEFAULT 1.0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES issues(id),
        FOREIGN KEY (signal_id) REFERENCES signals(id),
        UNIQUE(issue_id, signal_id)
      );

      CREATE INDEX IF NOT EXISTS idx_issue_signals_issue ON issue_signals(issue_id);
      CREATE INDEX IF NOT EXISTS idx_issue_signals_signal ON issue_signals(signal_id);

      -- Detection history for analytics
      CREATE TABLE IF NOT EXISTS detection_history (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        issue_id TEXT,
        signals_matched INTEGER NOT NULL,
        triggered_at TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[IssueDetection] Service started');

    // Run detection every 2 minutes
    this.checkIntervalId = setInterval(() => this.runDetection(), 2 * 60 * 1000);

    // Initial detection after 30 seconds
    setTimeout(() => this.runDetection(), 30000);
  }

  stop(): void {
    this.isRunning = false;
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    console.log('[IssueDetection] Service stopped');
  }

  async runDetection(): Promise<void> {
    console.log('[IssueDetection] Running detection cycle...');

    try {
      // 1. Pattern-based detection
      await this.runPatternDetection();

      // 2. Threshold-based alerts
      await this.runThresholdAlerts();

      // 3. LLM-enhanced analysis for high-priority signals
      await this.runLLMAnalysis();

    } catch (error) {
      console.error('[IssueDetection] Error during detection:', error);
    }
  }

  private async runPatternDetection(): Promise<void> {
    const now = new Date();

    for (const pattern of this.patterns) {
      // Check cooldown
      const lastTrigger = this.lastPatternTrigger.get(pattern.id);
      if (lastTrigger) {
        const elapsed = (now.getTime() - lastTrigger.getTime()) / 1000 / 60;
        if (elapsed < pattern.cooldownMinutes) {
          continue;
        }
      }

      // Get recent signals (last 60 minutes)
      const recentSignals = this.getRecentSignals(60);
      const matchedSignals = this.matchPattern(pattern, recentSignals);

      if (matchedSignals.length > 0) {
        await this.createIssueFromPattern(pattern, matchedSignals);
        this.lastPatternTrigger.set(pattern.id, now);
      }
    }
  }

  private matchPattern(pattern: DetectionPattern, signals: Signal[]): Signal[] {
    return signals.filter(signal => {
      return pattern.conditions.every(condition => {
        return this.evaluateCondition(condition, signal);
      });
    });
  }

  private evaluateCondition(condition: PatternCondition, signal: Signal): boolean {
    let fieldValue: string | number;

    switch (condition.type) {
      case 'keyword':
        fieldValue = `${signal.description} ${signal.source}`.toLowerCase();
        break;
      case 'severity':
        fieldValue = signal.severity;
        break;
      case 'source':
        fieldValue = signal.source.toLowerCase();
        break;
      case 'category':
        fieldValue = signal.category;
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'contains':
        if (typeof condition.value === 'string') {
          const regex = new RegExp(condition.value, 'i');
          return regex.test(String(fieldValue));
        }
        return false;
      case 'equals':
        return fieldValue === condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(String(fieldValue));
      case 'gte':
        return Number(fieldValue) >= Number(condition.value);
      case 'lte':
        return Number(fieldValue) <= Number(condition.value);
      default:
        return false;
    }
  }

  private async createIssueFromPattern(pattern: DetectionPattern, signals: Signal[]): Promise<void> {
    const issueId = uuidv4();
    const signalIds = signals.map(s => s.id);
    const now = new Date().toISOString();

    // Generate title and description from signals
    const topSignal = signals[0];
    const title = `[${pattern.name}] ${this.truncate(topSignal.description.split('\n')[0], 100)}`;
    const description = this.generateIssueDescription(pattern, signals);

    // Create issue
    this.db.prepare(`
      INSERT INTO issues (id, title, description, category, priority, status, detected_at, signal_ids, evidence)
      VALUES (?, ?, ?, ?, ?, 'detected', ?, ?, ?)
    `).run(
      issueId,
      title,
      description,
      pattern.category,
      pattern.priority,
      now,
      JSON.stringify(signalIds),
      JSON.stringify(signals.slice(0, 10).map(s => ({
        source: s.source,
        severity: s.severity,
        description: this.truncate(s.description, 200),
        timestamp: s.timestamp,
      })))
    );

    // Create signal correlations
    const insertCorrelation = this.db.prepare(`
      INSERT OR IGNORE INTO issue_signals (id, issue_id, signal_id, relevance_score)
      VALUES (?, ?, ?, ?)
    `);

    for (const signal of signals) {
      insertCorrelation.run(uuidv4(), issueId, signal.id, 1.0);
    }

    // Log detection
    this.db.prepare(`
      INSERT INTO detection_history (id, pattern_id, issue_id, signals_matched, triggered_at, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      pattern.id,
      issueId,
      signals.length,
      now,
      JSON.stringify({ patternName: pattern.name, signalIds })
    );

    // Log activity
    this.logActivity('ISSUE_DETECTED', pattern.priority, `New issue detected: ${title}`, {
      issueId,
      patternId: pattern.id,
      signalCount: signals.length,
    });

    // Emit WebSocket event
    this.io.emit('issue:detected', {
      issue: {
        id: issueId,
        title,
        description,
        category: pattern.category,
        priority: pattern.priority,
        status: 'detected',
        detected_at: now,
        signal_count: signals.length,
      },
    });

    console.log(`[IssueDetection] Created issue: ${title} (${signals.length} signals)`);

    // Create governance document for all issues
    await this.createIssueDocument(issueId, title, description, pattern, signals);

    // Check for high-risk and create lock if needed
    if (pattern.priority === 'critical') {
      await this.createHighRiskLock(issueId, title, pattern.category);
    }

    // Auto-create Agora session for critical/high priority issues
    if (pattern.priority === 'critical' || pattern.priority === 'high') {
      await this.createAutoAgoraSession(issueId, title, pattern.category, pattern.priority);
    } else {
      // For medium/low priority, trigger pipeline directly
      await this.triggerPipelineForIssue(issueId, title, pattern.category, pattern.priority);
    }
  }

  /**
   * Create a high-risk lock for critical issues
   */
  private async createHighRiskLock(
    issueId: string,
    title: string,
    category: string
  ): Promise<void> {
    if (!this.governanceOSBridge) {
      console.log('[IssueDetection] GovernanceOS Bridge not available, skipping lock creation');
      return;
    }

    try {
      const riskLevel = this.governanceOSBridge.classifyRisk(category);

      if (riskLevel === 'HIGH') {
        const approval = await this.governanceOSBridge.createHighRiskApproval({
          proposalId: issueId, // Using issueId as reference
          votingId: '', // Will be linked later if voting is created
          actionDescription: `Critical issue requires approval: ${title}`,
          actionType: category,
        });

        console.log(`[IssueDetection] Created high-risk lock ${approval.id} for issue ${issueId.slice(0, 8)}`);

        this.logActivity('APPROVAL', 'critical', `High-risk lock created for: ${title}`, {
          issueId,
          approvalId: approval.id,
          riskLevel: 'HIGH',
        });
      }
    } catch (error) {
      console.error(`[IssueDetection] Failed to create lock for issue ${issueId}:`, error);
    }
  }

  /**
   * Create a governance document for the detected issue
   */
  private async createIssueDocument(
    issueId: string,
    title: string,
    description: string,
    pattern: DetectionPattern,
    signals: Signal[]
  ): Promise<void> {
    if (!this.governanceOSBridge) {
      console.log('[IssueDetection] GovernanceOS Bridge not available, skipping document creation');
      return;
    }

    try {
      const docRegistry = this.governanceOSBridge.getGovernanceOS().getDocumentRegistry();

      // Create an RM (Risk Management) document for the issue
      const doc = await docRegistry.documents.create({
        type: 'RM', // Risk Management document
        title: `Issue Report: ${title}`,
        summary: `Detected issue in category ${pattern.category} with ${pattern.priority} priority`,
        content: JSON.stringify({
          issueId,
          patternId: pattern.id,
          patternName: pattern.name,
          category: pattern.category,
          priority: pattern.priority,
          signalCount: signals.length,
          signalSources: [...new Set(signals.map(s => s.source))],
          description,
          detectedAt: new Date().toISOString(),
        }),
        createdBy: 'issue-detection-service',
      });

      console.log(`[IssueDetection] Created governance document ${doc.id} for issue ${issueId.slice(0, 8)}`);

      // Emit document creation event
      this.io.emit('governance:document:created', {
        id: doc.id,
        type: 'RM',
        title: doc.title,
        state: doc.state,
        issueId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error(`[IssueDetection] Failed to create document for issue ${issueId}:`, error);
    }
  }

  /**
   * Trigger the governance pipeline directly for an issue
   */
  private async triggerPipelineForIssue(
    issueId: string,
    title: string,
    category: string,
    priority: string
  ): Promise<void> {
    if (!this.governanceOSBridge) {
      console.log('[IssueDetection] GovernanceOS Bridge not available, skipping pipeline');
      return;
    }

    try {
      console.log(`[IssueDetection] Triggering pipeline for issue: ${issueId.slice(0, 8)} - ${title}`);

      // Determine workflow type based on category
      const workflowType = this.determineWorkflowType(category);

      const result = await this.governanceOSBridge.runPipelineForIssue(issueId, {
        workflowType,
      });

      if (result.success) {
        console.log(`[IssueDetection] Pipeline completed for issue ${issueId.slice(0, 8)}: status=${result.status}`);
        this.logActivity('PIPELINE', priority === 'medium' ? 'info' : 'warning', `Pipeline started for: ${title}`, {
          issueId,
          workflowType,
        });
      } else {
        console.error(`[IssueDetection] Pipeline failed for issue ${issueId.slice(0, 8)}: status=${result.status}`);
      }

    } catch (error) {
      console.error(`[IssueDetection] Failed to trigger pipeline for issue ${issueId}:`, error);
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

  private generateIssueDescription(pattern: DetectionPattern, signals: Signal[]): string {
    const sources = [...new Set(signals.map(s => s.source))];
    const severities = signals.reduce((acc, s) => {
      acc[s.severity] = (acc[s.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let desc = `## ${pattern.description}\n\n`;
    desc += `**Detected at:** ${new Date().toISOString()}\n`;
    desc += `**Signals matched:** ${signals.length}\n`;
    desc += `**Sources:** ${sources.join(', ')}\n`;
    desc += `**Severity breakdown:** ${Object.entries(severities).map(([k, v]) => `${k}: ${v}`).join(', ')}\n\n`;
    desc += `### Sample Signals\n\n`;

    for (const signal of signals.slice(0, 5)) {
      desc += `- **[${signal.severity}]** ${this.truncate(signal.description.split('\n')[0], 150)}\n`;
    }

    return desc;
  }

  private async runThresholdAlerts(): Promise<void> {
    for (const threshold of this.alertThresholds) {
      if (!threshold.enabled) continue;

      const count = this.getSignalCount(
        threshold.category,
        threshold.severity,
        threshold.timeWindowMinutes
      );

      if (count >= threshold.threshold) {
        await this.createThresholdAlert(threshold, count);
      }
    }
  }

  private getSignalCount(category: string, severity: string, windowMinutes: number): number {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    let query = `SELECT COUNT(*) as count FROM signals WHERE timestamp > ?`;
    const params: any[] = [since];

    if (category !== '*') {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (severity !== '*') {
      query += ` AND severity = ?`;
      params.push(severity);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count;
  }

  private async createThresholdAlert(threshold: AlertThreshold, count: number): Promise<void> {
    // Check if we already have a similar open issue
    const existing = this.db.prepare(`
      SELECT id FROM issues
      WHERE category = ? AND status IN ('detected', 'confirmed')
      AND detected_at > datetime('now', '-1 hour')
      AND title LIKE ?
    `).get(threshold.category === '*' ? '%' : threshold.category, `%${threshold.name}%`);

    if (existing) return;

    const issueId = uuidv4();
    const now = new Date().toISOString();
    const title = `[Alert] ${threshold.name}: ${count} signals in ${threshold.timeWindowMinutes}m`;

    this.db.prepare(`
      INSERT INTO issues (id, title, description, category, priority, status, detected_at, evidence)
      VALUES (?, ?, ?, ?, ?, 'detected', ?, ?)
    `).run(
      issueId,
      title,
      `Threshold alert triggered: ${count} signals (threshold: ${threshold.threshold}) within ${threshold.timeWindowMinutes} minutes.`,
      threshold.category === '*' ? 'system' : threshold.category,
      threshold.severity === 'critical' ? 'critical' : 'high',
      now,
      JSON.stringify({ threshold, count, triggeredAt: now })
    );

    this.io.emit('issue:detected', {
      issue: { id: issueId, title, priority: 'high', status: 'detected' },
    });

    console.log(`[IssueDetection] Threshold alert: ${title}`);
  }

  private async runLLMAnalysis(): Promise<void> {
    // Get recent high-priority unanalyzed signals
    const signals = this.db.prepare(`
      SELECT s.* FROM signals s
      WHERE s.severity IN ('critical', 'high')
      AND s.timestamp > datetime('now', '-1 hour')
      AND NOT EXISTS (
        SELECT 1 FROM issue_signals iss WHERE iss.signal_id = s.id
      )
      ORDER BY s.timestamp DESC
      LIMIT 5
    `).all() as Signal[];

    if (signals.length === 0) return;

    try {
      const prompt = `Analyze these governance/security signals and identify any issues that require attention:

${signals.map((s, i) => `${i + 1}. [${s.severity}] ${s.source}: ${s.description.substring(0, 300)}`).join('\n\n')}

Respond in JSON format:
{
  "needsAttention": true/false,
  "suggestedTitle": "Brief issue title if needs attention",
  "category": "security|governance|market|defi|protocol",
  "priority": "critical|high|medium|low",
  "summary": "Brief summary of the issue",
  "suggestedActions": ["action1", "action2"]
}`;

      const response = await llmService.generate({
        prompt,
        complexity: 'balanced' as ModelComplexity,
        maxTokens: 512,
      });

      if (response && response.content) {
        // Parse JSON from response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);

          if (analysis.needsAttention) {
            await this.createLLMDetectedIssue(analysis, signals);
          }
        }
      }
    } catch (error) {
      console.error('[IssueDetection] LLM analysis error:', error);
    }
  }

  private async createLLMDetectedIssue(
    analysis: {
      suggestedTitle: string;
      category: string;
      priority: string;
      summary: string;
      suggestedActions: string[];
    },
    signals: Signal[]
  ): Promise<void> {
    const issueId = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO issues (id, title, description, category, priority, status, detected_at, signal_ids, suggested_actions)
      VALUES (?, ?, ?, ?, ?, 'detected', ?, ?, ?)
    `).run(
      issueId,
      `[AI] ${analysis.suggestedTitle}`,
      analysis.summary,
      analysis.category,
      analysis.priority,
      now,
      JSON.stringify(signals.map(s => s.id)),
      JSON.stringify(analysis.suggestedActions)
    );

    // Link signals
    const insertCorrelation = this.db.prepare(`
      INSERT OR IGNORE INTO issue_signals (id, issue_id, signal_id) VALUES (?, ?, ?)
    `);
    for (const signal of signals) {
      insertCorrelation.run(uuidv4(), issueId, signal.id);
    }

    this.io.emit('issue:detected', {
      issue: {
        id: issueId,
        title: `[AI] ${analysis.suggestedTitle}`,
        priority: analysis.priority,
        status: 'detected',
        aiDetected: true,
      },
    });

    console.log(`[IssueDetection] AI detected issue: ${analysis.suggestedTitle}`);

    // Auto-create Agora session for critical/high priority issues
    if (analysis.priority === 'critical' || analysis.priority === 'high') {
      await this.createAutoAgoraSession(
        issueId,
        `[AI] ${analysis.suggestedTitle}`,
        analysis.category,
        analysis.priority as 'critical' | 'high'
      );
    }
  }

  private getRecentSignals(minutesAgo: number): Signal[] {
    const since = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    return this.db.prepare(`
      SELECT * FROM signals WHERE timestamp > ? ORDER BY timestamp DESC
    `).all(since) as Signal[];
  }

  private truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
  }

  private logActivity(type: string, severity: string, message: string, details: any): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, type, severity, timestamp, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), type, severity, new Date().toISOString(), message, JSON.stringify(details));
  }

  /**
   * Automatically create an Agora discussion session for high-priority issues
   */
  private async createAutoAgoraSession(
    issueId: string,
    issueTitle: string,
    category: string,
    priority: 'critical' | 'high'
  ): Promise<void> {
    // Check cooldown - don't create sessions too frequently for the same issue
    const cooldownKey = `${issueId}`;
    const lastSession = this.lastAutoAgoraSession.get(cooldownKey);
    const cooldownMinutes = priority === 'critical' ? 30 : 60;

    if (lastSession) {
      const elapsed = (Date.now() - lastSession.getTime()) / 1000 / 60;
      if (elapsed < cooldownMinutes) {
        console.log(`[IssueDetection] Skipping auto Agora session (cooldown): ${issueTitle}`);
        return;
      }
    }

    try {
      const maxRounds = priority === 'critical' ? 7 : 5;

      // Create session via AgoraService
      const session = await this.agoraService.createSession({
        title: `[Auto] ${issueTitle}`,
        description: `Automated discussion for ${priority} priority issue.\n\nThis session was automatically created because a ${priority} priority issue was detected. The AI agents will analyze the issue and discuss potential solutions.`,
        issueId,
        topic: category,
        maxRounds,
        autoSummon: true,
      });

      if (session) {
        this.lastAutoAgoraSession.set(cooldownKey, new Date());

        // Log activity
        this.logActivity(
          'AGORA_SESSION_AUTO_CREATED',
          priority,
          `Auto-created Agora session for issue: ${issueTitle}`,
          {
            sessionId: session.id,
            issueId,
            category,
            priority,
            maxRounds,
          }
        );

        // Emit WebSocket event
        this.io.emit('agora:session-created', {
          session: {
            id: session.id,
            title: session.title,
            issueId,
            autoCreated: true,
          },
        });

        console.log(`[IssueDetection] Auto-created Agora session: ${session.id} for issue: ${issueTitle}`);
      }
    } catch (error) {
      console.error(`[IssueDetection] Failed to create auto Agora session:`, error);
    }
  }

  // === Issue Lifecycle Management ===

  updateIssueStatus(issueId: string, newStatus: string, resolution?: string): void {
    const validStatuses = ['detected', 'confirmed', 'in_progress', 'resolved', 'dismissed'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [newStatus, new Date().toISOString()];

    if (newStatus === 'resolved') {
      updates.push('resolved_at = ?');
      params.push(new Date().toISOString());
    }

    if (resolution) {
      updates.push('decision_packet = ?');
      params.push(resolution);
    }

    params.push(issueId);

    this.db.prepare(`UPDATE issues SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    this.io.emit('issue:updated', { issueId, status: newStatus });
    console.log(`[IssueDetection] Issue ${issueId} status updated to ${newStatus}`);
  }

  getIssueWithSignals(issueId: string): any {
    const issue = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId) as Issue;
    if (!issue) return null;

    const signals = this.db.prepare(`
      SELECT s.*, iss.relevance_score
      FROM signals s
      JOIN issue_signals iss ON s.id = iss.signal_id
      WHERE iss.issue_id = ?
      ORDER BY s.timestamp DESC
    `).all(issueId);

    return { ...issue, related_signals: signals };
  }

  getOpenIssues(): Issue[] {
    return this.db.prepare(`
      SELECT * FROM issues
      WHERE status IN ('detected', 'confirmed', 'in_progress')
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        detected_at DESC
    `).all() as Issue[];
  }

  getStats(): any {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM issues').get() as { count: number };
    const byStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM issues GROUP BY status
    `).all();
    const byPriority = this.db.prepare(`
      SELECT priority, COUNT(*) as count FROM issues GROUP BY priority
    `).all();
    const recentDetections = this.db.prepare(`
      SELECT COUNT(*) as count FROM issues WHERE detected_at > datetime('now', '-24 hours')
    `).get() as { count: number };

    return {
      total: total.count,
      byStatus: Object.fromEntries(byStatus.map((r: any) => [r.status, r.count])),
      byPriority: Object.fromEntries(byPriority.map((r: any) => [r.priority, r.count])),
      last24h: recentDetections.count,
    };
  }
}

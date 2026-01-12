// ===========================================
// Anti-Abuse Protection for Governance OS
// ===========================================
// Per SPEC Section Q.3: Spam/Abuse Protection

// ============================================
// Configuration
// ============================================

export interface AntiAbuseConfig {
  // Rate limiting
  maxSignalsPerHour: number;
  maxIssuesPerDay: number;

  // Deduplication
  deduplicationWindowDays: number;
  similarityThreshold: number;    // 0-1, higher = stricter

  // Quality filtering
  minimumSignalQuality: number;   // 0-100
  requireMultipleSources: boolean;
  minimumSourceCount: number;

  // Cooldowns
  cooldownAfterRejectionDays: number;
  cooldownBetweenSimilarHours: number;

  // Escalation
  humanEscalationThreshold: number;  // After N similar signals

  // Blacklists
  blockedDomains: string[];
  blockedPatterns: RegExp[];
}

export const DEFAULT_ANTI_ABUSE_CONFIG: AntiAbuseConfig = {
  // Rate limiting
  maxSignalsPerHour: 1000,
  maxIssuesPerDay: 10,

  // Deduplication
  deduplicationWindowDays: 7,
  similarityThreshold: 0.85,

  // Quality filtering
  minimumSignalQuality: 50,
  requireMultipleSources: true,
  minimumSourceCount: 2,

  // Cooldowns
  cooldownAfterRejectionDays: 30,
  cooldownBetweenSimilarHours: 24,

  // Escalation
  humanEscalationThreshold: 3,

  // Blacklists
  blockedDomains: [],
  blockedPatterns: [],
};

// ============================================
// Types
// ============================================

export interface Signal {
  id: string;
  source: string;
  domain?: string;
  content: string;
  quality: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  warnings: string[];
  shouldEscalate: boolean;
  cooldownUntil?: Date;
}

export interface SignalHistory {
  signalId: string;
  contentHash: string;
  status: 'accepted' | 'rejected' | 'pending';
  timestamp: Date;
  similarity?: number;
}

export interface RateLimitState {
  signalsThisHour: number;
  issuesThisDay: number;
  hourStarted: Date;
  dayStarted: Date;
}

// ============================================
// Anti-Abuse Guard
// ============================================

/**
 * Anti-Abuse Guard for protecting the governance system
 * from spam, abuse, and low-quality signals.
 */
export class AntiAbuseGuard {
  private config: AntiAbuseConfig;
  private signalHistory: Map<string, SignalHistory> = new Map();
  private contentHashes: Map<string, { timestamp: Date; signalId: string }[]> = new Map();
  private rateLimitState: RateLimitState;
  private similarSignalCounts: Map<string, number> = new Map();
  private rejectedTopics: Map<string, Date> = new Map();

  constructor(config: Partial<AntiAbuseConfig> = {}) {
    this.config = { ...DEFAULT_ANTI_ABUSE_CONFIG, ...config };
    this.rateLimitState = {
      signalsThisHour: 0,
      issuesThisDay: 0,
      hourStarted: new Date(),
      dayStarted: new Date(),
    };
  }

  // ==========================================
  // Main Validation
  // ==========================================

  /**
   * Validate a signal against all anti-abuse rules.
   */
  validateSignal(signal: Signal): ValidationResult {
    const warnings: string[] = [];
    let shouldEscalate = false;

    // Check rate limits
    if (!this.checkRateLimits()) {
      return {
        valid: false,
        reason: 'Rate limit exceeded',
        warnings,
        shouldEscalate: false,
      };
    }

    // Check blocked domains
    if (signal.domain && this.isBlockedDomain(signal.domain)) {
      return {
        valid: false,
        reason: `Domain blocked: ${signal.domain}`,
        warnings,
        shouldEscalate: false,
      };
    }

    // Check blocked patterns
    const matchedPattern = this.matchesBlockedPattern(signal.content);
    if (matchedPattern) {
      return {
        valid: false,
        reason: 'Content matches blocked pattern',
        warnings,
        shouldEscalate: false,
      };
    }

    // Check minimum quality
    if (signal.quality < this.config.minimumSignalQuality) {
      warnings.push(`Low quality signal: ${signal.quality}/${this.config.minimumSignalQuality}`);
      return {
        valid: false,
        reason: 'Signal quality below minimum threshold',
        warnings,
        shouldEscalate: false,
      };
    }

    // Check for duplicates
    const duplicateCheck = this.checkDuplicate(signal);
    if (duplicateCheck.isDuplicate) {
      return {
        valid: false,
        reason: `Duplicate signal detected (similarity: ${(duplicateCheck.similarity * 100).toFixed(1)}%)`,
        warnings,
        shouldEscalate: false,
        cooldownUntil: duplicateCheck.cooldownUntil,
      };
    }

    // Check rejected topic cooldown
    const rejectedCooldown = this.checkRejectedTopicCooldown(signal);
    if (rejectedCooldown.inCooldown) {
      return {
        valid: false,
        reason: 'Topic recently rejected, in cooldown period',
        warnings,
        shouldEscalate: false,
        cooldownUntil: rejectedCooldown.cooldownUntil,
      };
    }

    // Check for escalation threshold
    const similarCount = this.getSimilarSignalCount(signal);
    if (similarCount >= this.config.humanEscalationThreshold) {
      shouldEscalate = true;
      warnings.push(`Similar signals threshold reached: ${similarCount}`);
    }

    // All checks passed
    this.recordSignal(signal, 'accepted');
    this.rateLimitState.signalsThisHour++;

    return {
      valid: true,
      warnings,
      shouldEscalate,
    };
  }

  /**
   * Validate multiple sources requirement.
   */
  validateMultipleSources(signalIds: string[]): ValidationResult {
    const warnings: string[] = [];

    if (!this.config.requireMultipleSources) {
      return { valid: true, warnings, shouldEscalate: false };
    }

    const uniqueSources = new Set<string>();
    for (const id of signalIds) {
      const history = this.signalHistory.get(id);
      if (history) {
        // Extract source from ID or metadata if available
        uniqueSources.add(id.split('-')[0] || 'unknown');
      }
    }

    if (uniqueSources.size < this.config.minimumSourceCount) {
      return {
        valid: false,
        reason: `Insufficient sources: ${uniqueSources.size}/${this.config.minimumSourceCount} required`,
        warnings,
        shouldEscalate: false,
      };
    }

    return { valid: true, warnings, shouldEscalate: false };
  }

  /**
   * Mark a topic as rejected (triggers cooldown).
   */
  rejectTopic(topicHash: string): void {
    this.rejectedTopics.set(topicHash, new Date());
  }

  /**
   * Record an issue creation (for rate limiting).
   */
  recordIssueCreated(): void {
    this.checkAndResetDayCounter();
    this.rateLimitState.issuesThisDay++;
  }

  // ==========================================
  // Rate Limiting
  // ==========================================

  private checkRateLimits(): boolean {
    this.checkAndResetHourCounter();
    this.checkAndResetDayCounter();

    if (this.rateLimitState.signalsThisHour >= this.config.maxSignalsPerHour) {
      return false;
    }

    if (this.rateLimitState.issuesThisDay >= this.config.maxIssuesPerDay) {
      return false;
    }

    return true;
  }

  private checkAndResetHourCounter(): void {
    const now = new Date();
    const hourElapsed = now.getTime() - this.rateLimitState.hourStarted.getTime() > 3600000;

    if (hourElapsed) {
      this.rateLimitState.signalsThisHour = 0;
      this.rateLimitState.hourStarted = now;
    }
  }

  private checkAndResetDayCounter(): void {
    const now = new Date();
    const dayElapsed = now.getTime() - this.rateLimitState.dayStarted.getTime() > 86400000;

    if (dayElapsed) {
      this.rateLimitState.issuesThisDay = 0;
      this.rateLimitState.dayStarted = now;
    }
  }

  // ==========================================
  // Blacklisting
  // ==========================================

  private isBlockedDomain(domain: string): boolean {
    const normalized = domain.toLowerCase();
    return this.config.blockedDomains.some(blocked =>
      normalized === blocked.toLowerCase() || normalized.endsWith('.' + blocked.toLowerCase())
    );
  }

  private matchesBlockedPattern(content: string): boolean {
    return this.config.blockedPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Add a domain to the blocklist.
   */
  blockDomain(domain: string): void {
    if (!this.config.blockedDomains.includes(domain.toLowerCase())) {
      this.config.blockedDomains.push(domain.toLowerCase());
    }
  }

  /**
   * Remove a domain from the blocklist.
   */
  unblockDomain(domain: string): void {
    const idx = this.config.blockedDomains.indexOf(domain.toLowerCase());
    if (idx >= 0) {
      this.config.blockedDomains.splice(idx, 1);
    }
  }

  /**
   * Add a pattern to the blocklist.
   */
  blockPattern(pattern: RegExp): void {
    this.config.blockedPatterns.push(pattern);
  }

  // ==========================================
  // Deduplication
  // ==========================================

  private checkDuplicate(signal: Signal): {
    isDuplicate: boolean;
    similarity: number;
    cooldownUntil?: Date;
  } {
    const contentHash = this.hashContent(signal.content);
    const windowStart = new Date(
      Date.now() - this.config.deduplicationWindowDays * 24 * 60 * 60 * 1000
    );

    // Check exact duplicates
    const existingHashes = this.contentHashes.get(contentHash) || [];
    const recentDuplicates = existingHashes.filter(h => h.timestamp >= windowStart);

    if (recentDuplicates.length > 0) {
      const cooldownUntil = new Date(
        recentDuplicates[0].timestamp.getTime() +
        this.config.cooldownBetweenSimilarHours * 60 * 60 * 1000
      );

      return {
        isDuplicate: true,
        similarity: 1.0,
        cooldownUntil: cooldownUntil > new Date() ? cooldownUntil : undefined,
      };
    }

    // Check similar content (simplified similarity check)
    for (const [hash, entries] of this.contentHashes.entries()) {
      if (hash === contentHash) continue;

      const recentEntries = entries.filter(e => e.timestamp >= windowStart);
      if (recentEntries.length === 0) continue;

      const similarity = this.calculateSimilarity(contentHash, hash);
      if (similarity >= this.config.similarityThreshold) {
        const cooldownUntil = new Date(
          recentEntries[0].timestamp.getTime() +
          this.config.cooldownBetweenSimilarHours * 60 * 60 * 1000
        );

        return {
          isDuplicate: true,
          similarity,
          cooldownUntil: cooldownUntil > new Date() ? cooldownUntil : undefined,
        };
      }
    }

    return { isDuplicate: false, similarity: 0 };
  }

  private hashContent(content: string): string {
    // Simple hash for content deduplication
    let hash = 0;
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  private calculateSimilarity(hash1: string, hash2: string): number {
    // Simplified similarity based on hash distance
    // In production, use proper text similarity (cosine, Jaccard, etc.)
    if (hash1 === hash2) return 1.0;

    const distance = Math.abs(parseInt(hash1, 36) - parseInt(hash2, 36));
    const maxHash = Math.max(parseInt(hash1, 36), parseInt(hash2, 36));

    if (maxHash === 0) return 0;

    const similarity = 1 - (distance / maxHash);
    return Math.max(0, Math.min(1, similarity));
  }

  // ==========================================
  // Cooldowns
  // ==========================================

  private checkRejectedTopicCooldown(signal: Signal): {
    inCooldown: boolean;
    cooldownUntil?: Date;
  } {
    const topicHash = this.hashContent(signal.content);
    const rejectedAt = this.rejectedTopics.get(topicHash);

    if (!rejectedAt) {
      return { inCooldown: false };
    }

    const cooldownEnd = new Date(
      rejectedAt.getTime() + this.config.cooldownAfterRejectionDays * 24 * 60 * 60 * 1000
    );

    if (cooldownEnd > new Date()) {
      return { inCooldown: true, cooldownUntil: cooldownEnd };
    }

    // Cooldown expired, remove from map
    this.rejectedTopics.delete(topicHash);
    return { inCooldown: false };
  }

  // ==========================================
  // Escalation
  // ==========================================

  private getSimilarSignalCount(signal: Signal): number {
    const contentHash = this.hashContent(signal.content);
    return this.similarSignalCounts.get(contentHash) || 0;
  }

  private recordSignal(signal: Signal, status: 'accepted' | 'rejected'): void {
    const contentHash = this.hashContent(signal.content);

    // Record in history
    this.signalHistory.set(signal.id, {
      signalId: signal.id,
      contentHash,
      status,
      timestamp: signal.timestamp,
    });

    // Update content hash index
    const existing = this.contentHashes.get(contentHash) || [];
    existing.push({ timestamp: signal.timestamp, signalId: signal.id });
    this.contentHashes.set(contentHash, existing);

    // Update similar signal count
    const count = this.similarSignalCounts.get(contentHash) || 0;
    this.similarSignalCounts.set(contentHash, count + 1);
  }

  // ==========================================
  // Stats & Cleanup
  // ==========================================

  /**
   * Get current anti-abuse statistics.
   */
  getStats(): {
    signalsThisHour: number;
    issuesThisDay: number;
    totalHistoryEntries: number;
    blockedDomains: number;
    blockedPatterns: number;
    rejectedTopics: number;
  } {
    return {
      signalsThisHour: this.rateLimitState.signalsThisHour,
      issuesThisDay: this.rateLimitState.issuesThisDay,
      totalHistoryEntries: this.signalHistory.size,
      blockedDomains: this.config.blockedDomains.length,
      blockedPatterns: this.config.blockedPatterns.length,
      rejectedTopics: this.rejectedTopics.size,
    };
  }

  /**
   * Cleanup old entries to prevent memory growth.
   */
  cleanup(): void {
    const windowStart = new Date(
      Date.now() - this.config.deduplicationWindowDays * 24 * 60 * 60 * 1000
    );

    // Clean signal history
    for (const [id, history] of this.signalHistory.entries()) {
      if (history.timestamp < windowStart) {
        this.signalHistory.delete(id);
      }
    }

    // Clean content hashes
    for (const [hash, entries] of this.contentHashes.entries()) {
      const filtered = entries.filter(e => e.timestamp >= windowStart);
      if (filtered.length === 0) {
        this.contentHashes.delete(hash);
        this.similarSignalCounts.delete(hash);
      } else {
        this.contentHashes.set(hash, filtered);
      }
    }

    // Clean rejected topics
    const cooldownStart = new Date(
      Date.now() - this.config.cooldownAfterRejectionDays * 24 * 60 * 60 * 1000
    );

    for (const [topic, rejectedAt] of this.rejectedTopics.entries()) {
      if (rejectedAt < cooldownStart) {
        this.rejectedTopics.delete(topic);
      }
    }
  }

  /**
   * Get configuration.
   */
  getConfig(): AntiAbuseConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<AntiAbuseConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset all state (for testing).
   */
  reset(): void {
    this.signalHistory.clear();
    this.contentHashes.clear();
    this.similarSignalCounts.clear();
    this.rejectedTopics.clear();
    this.rateLimitState = {
      signalsThisHour: 0,
      issuesThisDay: 0,
      hourStarted: new Date(),
      dayStarted: new Date(),
    };
  }
}

// ============================================
// Factory
// ============================================

let globalGuard: AntiAbuseGuard | null = null;

/**
 * Get or create the global anti-abuse guard.
 */
export function getAntiAbuseGuard(): AntiAbuseGuard {
  if (!globalGuard) {
    globalGuard = new AntiAbuseGuard();
  }
  return globalGuard;
}

/**
 * Create a new anti-abuse guard instance.
 */
export function createAntiAbuseGuard(config?: Partial<AntiAbuseConfig>): AntiAbuseGuard {
  return new AntiAbuseGuard(config);
}

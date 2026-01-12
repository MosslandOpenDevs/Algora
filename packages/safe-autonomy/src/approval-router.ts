// ===========================================
// Approval Router for Algora Safe Autonomy
// ===========================================

import { randomUUID } from 'crypto';
import type {
  RiskLevel,
  RoutingPolicy,
  PendingReview,
  RoutingResult,
  LockedAction,
  SafeAutonomyConfig,
} from './types.js';
import { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';

// ============================================
// Router Types
// ============================================

/**
 * A reviewer who can approve actions.
 */
export interface Reviewer {
  id: string;
  name: string;
  type: 'human' | 'agent';
  roles: string[];
  isDirector3: boolean;
  isAvailable: boolean;
  lastActiveAt: Date;
}

/**
 * Notification to be sent to a reviewer.
 */
export interface ReviewNotification {
  id: string;
  reviewerId: string;
  pendingReviewId: string;
  type: 'new_review' | 'reminder' | 'urgent' | 'escalation';
  title: string;
  summary: string;
  priority: number;
  sentAt: Date;
  readAt?: Date;
}

/**
 * Event handlers for approval router.
 */
export interface ApprovalRouterEvents {
  onReviewCreated: (review: PendingReview) => void;
  onReviewerNotified: (notification: ReviewNotification) => void;
  onReviewCompleted: (review: PendingReview) => void;
  onReviewEscalated: (review: PendingReview, escalatedTo: string) => void;
}

// ============================================
// Storage Interface
// ============================================

/**
 * Interface for pending review storage.
 */
export interface ReviewStorage {
  save(review: PendingReview): Promise<void>;
  get(id: string): Promise<PendingReview | null>;
  getByLockedActionId(lockedActionId: string): Promise<PendingReview | null>;
  getAll(status?: PendingReview['status']): Promise<PendingReview[]>;
  getByReviewer(reviewerId: string): Promise<PendingReview[]>;
  update(review: PendingReview): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory storage for development/testing.
 */
export class InMemoryReviewStorage implements ReviewStorage {
  private reviews: Map<string, PendingReview> = new Map();

  async save(review: PendingReview): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async get(id: string): Promise<PendingReview | null> {
    return this.reviews.get(id) ?? null;
  }

  async getByLockedActionId(
    lockedActionId: string
  ): Promise<PendingReview | null> {
    for (const review of this.reviews.values()) {
      if (review.lockedActionId === lockedActionId) {
        return review;
      }
    }
    return null;
  }

  async getAll(status?: PendingReview['status']): Promise<PendingReview[]> {
    const all = Array.from(this.reviews.values());
    if (status) {
      return all.filter((r) => r.status === status);
    }
    return all;
  }

  async getByReviewer(reviewerId: string): Promise<PendingReview[]> {
    return Array.from(this.reviews.values()).filter((r) =>
      r.routedTo.includes(reviewerId)
    );
  }

  async update(review: PendingReview): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async delete(id: string): Promise<void> {
    this.reviews.delete(id);
  }
}

// ============================================
// Reviewer Registry
// ============================================

/**
 * Registry of available reviewers.
 */
export class ReviewerRegistry {
  private reviewers: Map<string, Reviewer> = new Map();

  register(reviewer: Reviewer): void {
    this.reviewers.set(reviewer.id, reviewer);
  }

  get(id: string): Reviewer | undefined {
    return this.reviewers.get(id);
  }

  getDirector3(): Reviewer | undefined {
    for (const reviewer of this.reviewers.values()) {
      if (reviewer.isDirector3) {
        return reviewer;
      }
    }
    return undefined;
  }

  getAvailableReviewers(): Reviewer[] {
    return Array.from(this.reviewers.values()).filter((r) => r.isAvailable);
  }

  getReviewersByRole(role: string): Reviewer[] {
    return Array.from(this.reviewers.values()).filter((r) =>
      r.roles.includes(role)
    );
  }

  getHumanReviewers(): Reviewer[] {
    return Array.from(this.reviewers.values()).filter(
      (r) => r.type === 'human'
    );
  }
}

// ============================================
// Approval Router Class
// ============================================

/**
 * ApprovalRouter routes review requests to appropriate reviewers
 * based on risk level and routing policies.
 */
export class ApprovalRouter {
  private storage: ReviewStorage;
  private reviewerRegistry: ReviewerRegistry;
  private config: SafeAutonomyConfig;
  private eventHandlers: Partial<ApprovalRouterEvents> = {};

  constructor(
    storage: ReviewStorage = new InMemoryReviewStorage(),
    reviewerRegistry: ReviewerRegistry = new ReviewerRegistry(),
    config: SafeAutonomyConfig = DEFAULT_SAFE_AUTONOMY_CONFIG
  ) {
    this.storage = storage;
    this.reviewerRegistry = reviewerRegistry;
    this.config = config;
  }

  /**
   * Register event handlers.
   */
  on<K extends keyof ApprovalRouterEvents>(
    event: K,
    handler: ApprovalRouterEvents[K]
  ): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Get the reviewer registry.
   */
  getReviewerRegistry(): ReviewerRegistry {
    return this.reviewerRegistry;
  }

  /**
   * Route a locked action for review.
   */
  async route(
    lockedAction: LockedAction,
    title: string,
    summary: string
  ): Promise<RoutingResult> {
    const policy = this.getPolicy(lockedAction.riskLevel);
    const reviewers = this.selectReviewers(policy);

    const dueAt = new Date(
      Date.now() + policy.timeoutHours * 60 * 60 * 1000
    );

    const pendingReview: PendingReview = {
      id: randomUUID(),
      lockedActionId: lockedAction.id,
      documentId: lockedAction.documentId,
      title,
      summary,
      riskLevel: lockedAction.riskLevel,
      routedTo: reviewers.map((r) => r.id),
      createdAt: new Date(),
      dueAt,
      status: 'pending',
      priority: this.calculatePriority(lockedAction.riskLevel),
    };

    await this.storage.save(pendingReview);
    this.eventHandlers.onReviewCreated?.(pendingReview);

    // Send notifications
    const notifications = await this.notifyReviewers(
      pendingReview,
      reviewers,
      'new_review'
    );

    const nextReminderAt = new Date(
      Date.now() +
        this.config.passiveConsensus.reminderIntervalHours[0] * 60 * 60 * 1000
    );

    return {
      pendingReview,
      notifiedReviewers: notifications.map((n) => n.reviewerId),
      nextReminderAt,
    };
  }

  /**
   * Route directly to Director 3.
   */
  async routeToDirector3(
    lockedAction: LockedAction,
    title: string,
    summary: string,
    reason: string
  ): Promise<RoutingResult> {
    const director3 = this.reviewerRegistry.getDirector3();
    if (!director3) {
      throw new Error('Director 3 not registered in reviewer registry');
    }

    const dueAt = new Date(
      Date.now() + this.config.director3.escalationTimeoutHours * 60 * 60 * 1000
    );

    const pendingReview: PendingReview = {
      id: randomUUID(),
      lockedActionId: lockedAction.id,
      documentId: lockedAction.documentId,
      title: `[URGENT] ${title}`,
      summary: `${summary}\n\nEscalation Reason: ${reason}`,
      riskLevel: 'HIGH',
      routedTo: [director3.id],
      createdAt: new Date(),
      dueAt,
      status: 'pending',
      priority: 100, // Maximum priority
    };

    await this.storage.save(pendingReview);
    this.eventHandlers.onReviewCreated?.(pendingReview);

    await this.notifyReviewers(pendingReview, [director3], 'urgent');

    return {
      pendingReview,
      notifiedReviewers: [director3.id],
      nextReminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Mark a review as completed.
   */
  async completeReview(reviewId: string): Promise<void> {
    const review = await this.storage.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    review.status = 'completed';
    await this.storage.update(review);
    this.eventHandlers.onReviewCompleted?.(review);
  }

  /**
   * Escalate a review to Director 3.
   */
  async escalate(reviewId: string, reason: string): Promise<void> {
    const review = await this.storage.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const director3 = this.reviewerRegistry.getDirector3();
    if (!director3) {
      throw new Error('Director 3 not registered');
    }

    // Update review
    review.riskLevel = 'HIGH';
    review.priority = 100;
    review.title = `[ESCALATED] ${review.title}`;
    review.summary = `${review.summary}\n\nEscalation Reason: ${reason}`;

    if (!review.routedTo.includes(director3.id)) {
      review.routedTo.push(director3.id);
    }

    await this.storage.update(review);
    await this.notifyReviewers(review, [director3], 'escalation');
    this.eventHandlers.onReviewEscalated?.(review, director3.id);
  }

  /**
   * Send reminders for pending reviews.
   */
  async sendReminders(): Promise<ReviewNotification[]> {
    const pending = await this.storage.getAll('pending');
    const notifications: ReviewNotification[] = [];
    const now = Date.now();

    for (const review of pending) {
      // Check if due soon (within 24 hours)
      const hoursUntilDue =
        (review.dueAt.getTime() - now) / (1000 * 60 * 60);

      if (hoursUntilDue <= 24 && hoursUntilDue > 0) {
        const reviewers = review.routedTo
          .map((id) => this.reviewerRegistry.get(id))
          .filter((r): r is Reviewer => r !== undefined);

        const sent = await this.notifyReviewers(review, reviewers, 'reminder');
        notifications.push(...sent);
      }
    }

    return notifications;
  }

  /**
   * Get pending reviews for a specific reviewer.
   */
  async getReviewsForReviewer(reviewerId: string): Promise<PendingReview[]> {
    return this.storage.getByReviewer(reviewerId);
  }

  /**
   * Get all pending reviews.
   */
  async getPendingReviews(): Promise<PendingReview[]> {
    return this.storage.getAll('pending');
  }

  /**
   * Get a pending review by ID.
   */
  async getReview(id: string): Promise<PendingReview | null> {
    return this.storage.get(id);
  }

  // ============================================
  // Private Methods
  // ============================================

  private getPolicy(riskLevel: RiskLevel): RoutingPolicy {
    const policy = this.config.routingPolicies.find(
      (p) => p.riskLevel === riskLevel
    );
    if (!policy) {
      throw new Error(`No routing policy for risk level: ${riskLevel}`);
    }
    return policy;
  }

  private selectReviewers(policy: RoutingPolicy): Reviewer[] {
    switch (policy.routeTo) {
      case 'director_3': {
        const director3 = this.reviewerRegistry.getDirector3();
        return director3 ? [director3] : [];
      }
      case 'any_reviewer': {
        return this.reviewerRegistry.getHumanReviewers().slice(0, 3);
      }
      case 'auto': {
        return [];
      }
    }
  }

  private calculatePriority(riskLevel: RiskLevel): number {
    switch (riskLevel) {
      case 'HIGH':
        return 100;
      case 'MID':
        return 50;
      case 'LOW':
        return 10;
    }
  }

  private async notifyReviewers(
    review: PendingReview,
    reviewers: Reviewer[],
    type: ReviewNotification['type']
  ): Promise<ReviewNotification[]> {
    const notifications: ReviewNotification[] = [];

    for (const reviewer of reviewers) {
      const notification: ReviewNotification = {
        id: randomUUID(),
        reviewerId: reviewer.id,
        pendingReviewId: review.id,
        type,
        title: review.title,
        summary: review.summary,
        priority: review.priority,
        sentAt: new Date(),
      };

      notifications.push(notification);
      this.eventHandlers.onReviewerNotified?.(notification);
    }

    return notifications;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new ApprovalRouter instance.
 */
export function createApprovalRouter(
  storage?: ReviewStorage,
  reviewerRegistry?: ReviewerRegistry,
  config?: SafeAutonomyConfig
): ApprovalRouter {
  return new ApprovalRouter(storage, reviewerRegistry, config);
}

/**
 * Create the default routing policies.
 */
export function getDefaultRoutingPolicies(): RoutingPolicy[] {
  return [
    {
      riskLevel: 'LOW',
      routeTo: 'auto',
      reviewRequired: false,
      timeoutAction: 'auto_approve',
      timeoutHours: 24,
    },
    {
      riskLevel: 'MID',
      routeTo: 'any_reviewer',
      reviewRequired: false,
      timeoutAction: 'auto_approve',
      timeoutHours: 48,
    },
    {
      riskLevel: 'HIGH',
      routeTo: 'director_3',
      reviewRequired: true,
      timeoutAction: 'escalate',
      timeoutHours: 72,
    },
  ];
}

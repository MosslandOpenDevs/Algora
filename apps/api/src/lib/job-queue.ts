import { EventEmitter } from 'events';

/**
 * Job status enum
 */
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
}

/**
 * Job interface
 */
export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
  result?: unknown;
}

/**
 * Job options
 */
export interface JobOptions {
  priority?: number;       // Higher = processed first (default: 0)
  delay?: number;          // Delay in ms before processing
  attempts?: number;       // Max retry attempts (default: 3)
  backoff?: number;        // Backoff multiplier for retries (default: 2)
}

/**
 * Queue options
 */
export interface QueueOptions {
  concurrency?: number;    // Max concurrent jobs (default: 5)
  pollInterval?: number;   // Check for jobs every N ms (default: 1000)
}

/**
 * Job processor function
 */
type JobProcessor<T, R> = (job: Job<T>) => Promise<R>;

/**
 * InMemoryQueue - A simple in-memory job queue
 *
 * Features:
 * - Priority queue (higher priority processed first)
 * - Delayed jobs
 * - Retry with exponential backoff
 * - Concurrency control
 * - Event emission for monitoring
 *
 * Can be replaced with BullMQ when Redis is available.
 *
 * Usage:
 * ```typescript
 * const queue = new InMemoryQueue<{ userId: string }>('notifications', {
 *   concurrency: 3,
 * });
 *
 * queue.process(async (job) => {
 *   await sendNotification(job.data.userId);
 *   return { sent: true };
 * });
 *
 * await queue.add('send-welcome', { userId: '123' }, { priority: 10 });
 * ```
 */
export class InMemoryQueue<T = unknown, R = unknown> extends EventEmitter {
  private jobs: Map<string, Job<T>> = new Map();
  private processor?: JobProcessor<T, R>;
  private activeCount = 0;
  private pollTimer?: NodeJS.Timeout;
  private isRunning = false;
  private jobCounter = 0;

  constructor(
    public readonly name: string,
    private options: QueueOptions = {}
  ) {
    super();
    this.options = {
      concurrency: 5,
      pollInterval: 1000,
      ...options,
    };
  }

  /**
   * Generate unique job ID
   */
  private generateId(): string {
    return `${this.name}-${Date.now()}-${++this.jobCounter}`;
  }

  /**
   * Add a job to the queue
   */
  async add(name: string, data: T, options: JobOptions = {}): Promise<Job<T>> {
    const job: Job<T> = {
      id: this.generateId(),
      name,
      data,
      status: options.delay ? JobStatus.DELAYED : JobStatus.WAITING,
      priority: options.priority ?? 0,
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      delay: options.delay ?? 0,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.emit('added', job);

    // Handle delayed jobs
    if (options.delay) {
      setTimeout(() => {
        if (this.jobs.has(job.id)) {
          job.status = JobStatus.WAITING;
          this.emit('waiting', job);
        }
      }, options.delay);
    }

    return job;
  }

  /**
   * Add multiple jobs at once
   */
  async addBulk(
    jobs: Array<{ name: string; data: T; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    return Promise.all(
      jobs.map(({ name, data, options }) => this.add(name, data, options))
    );
  }

  /**
   * Set the job processor function
   */
  process(processor: JobProcessor<T, R>): void {
    this.processor = processor;
    this.start();
  }

  /**
   * Start processing jobs
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.poll();
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Poll for jobs to process
   */
  private poll(): void {
    if (!this.isRunning) return;

    this.processNext();

    this.pollTimer = setTimeout(
      () => this.poll(),
      this.options.pollInterval
    );
  }

  /**
   * Process the next available job
   */
  private async processNext(): Promise<void> {
    if (!this.processor) return;
    if (this.activeCount >= (this.options.concurrency ?? 5)) return;

    // Find next job (highest priority, waiting status)
    const waitingJobs = Array.from(this.jobs.values())
      .filter((job) => job.status === JobStatus.WAITING)
      .sort((a, b) => b.priority - a.priority);

    if (waitingJobs.length === 0) return;

    const job = waitingJobs[0];
    await this.processJob(job);
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job<T>): Promise<void> {
    if (!this.processor) return;

    job.status = JobStatus.ACTIVE;
    job.processedAt = new Date();
    job.attempts++;
    this.activeCount++;

    this.emit('active', job);

    try {
      const result = await this.processor(job);
      job.result = result;
      job.status = JobStatus.COMPLETED;
      job.completedAt = new Date();
      this.emit('completed', job, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      job.failedReason = errorMessage;

      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const backoffMs = Math.pow(2, job.attempts) * 1000;
        job.status = JobStatus.DELAYED;
        this.emit('retrying', job, backoffMs);

        setTimeout(() => {
          if (this.jobs.has(job.id)) {
            job.status = JobStatus.WAITING;
          }
        }, backoffMs);
      } else {
        job.status = JobStatus.FAILED;
        this.emit('failed', job, error);
      }
    } finally {
      this.activeCount--;
    }
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): Job<T> | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all jobs with a specific status
   */
  getJobs(status?: JobStatus): Job<T>[] {
    const jobs = Array.from(this.jobs.values());
    return status ? jobs.filter((job) => job.status === status) : jobs;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      waiting: jobs.filter((j) => j.status === JobStatus.WAITING).length,
      active: jobs.filter((j) => j.status === JobStatus.ACTIVE).length,
      completed: jobs.filter((j) => j.status === JobStatus.COMPLETED).length,
      failed: jobs.filter((j) => j.status === JobStatus.FAILED).length,
      delayed: jobs.filter((j) => j.status === JobStatus.DELAYED).length,
      total: jobs.length,
    };
  }

  /**
   * Remove completed/failed jobs older than maxAge
   */
  clean(maxAgeMs: number = 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) &&
        job.completedAt &&
        job.completedAt.getTime() < cutoff
      ) {
        this.jobs.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all jobs
   */
  clear(): void {
    this.jobs.clear();
    this.emit('cleared');
  }
}

/**
 * Queue manager for multiple queues
 */
class QueueManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queues: Map<string, InMemoryQueue<any, any>> = new Map();

  /**
   * Get or create a queue
   */
  getQueue<T = unknown, R = unknown>(
    name: string,
    options?: QueueOptions
  ): InMemoryQueue<T, R> {
    if (!this.queues.has(name)) {
      this.queues.set(name, new InMemoryQueue<T, R>(name, options));
    }
    return this.queues.get(name) as InMemoryQueue<T, R>;
  }

  /**
   * Stop all queues
   */
  stopAll(): void {
    for (const queue of this.queues.values()) {
      queue.stop();
    }
  }

  /**
   * Get stats for all queues
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAllStats(): Record<string, ReturnType<InMemoryQueue<any, any>['getStats']>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: Record<string, ReturnType<InMemoryQueue<any, any>['getStats']>> = {};
    for (const [name, queue] of this.queues.entries()) {
      stats[name] = queue.getStats();
    }
    return stats;
  }
}

// Singleton queue manager
export const queueManager = new QueueManager();

// Pre-defined queues for common tasks
export const llmQueue = queueManager.getQueue<
  { prompt: string; model: string; tier: number },
  { response: string }
>('llm', { concurrency: 3 });

export const notificationQueue = queueManager.getQueue<
  { type: string; payload: unknown },
  void
>('notifications', { concurrency: 10 });

export const reportQueue = queueManager.getQueue<
  { reportType: string; params: Record<string, unknown> },
  { reportId: string }
>('reports', { concurrency: 1 });

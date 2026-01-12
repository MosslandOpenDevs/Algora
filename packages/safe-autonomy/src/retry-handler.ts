// ===========================================
// Retry Handler for Algora Safe Autonomy
// ===========================================

import { randomUUID } from 'crypto';
import type {
  RetryConfig,
  RetryStatus,
  RetryableTask,
  RetryResult,
} from './types.js';
import { DEFAULT_SAFE_AUTONOMY_CONFIG } from './types.js';

// ============================================
// Retry Handler Types
// ============================================

/**
 * Options for creating a retryable task.
 */
export interface CreateTaskOptions<T> {
  name: string;
  payload: T;
  customConfig?: Partial<RetryConfig>;
}

/**
 * A function that can be retried.
 */
export type RetryableFunction<T, R> = (payload: T) => Promise<R>;

/**
 * Event handlers for retry handler.
 */
export interface RetryHandlerEvents {
  onTaskCreated: (task: RetryableTask) => void;
  onTaskStarted: (task: RetryableTask) => void;
  onTaskRetry: (task: RetryableTask, attempt: number, error: Error) => void;
  onTaskSucceeded: (task: RetryableTask, result: unknown) => void;
  onTaskFailed: (task: RetryableTask, error: Error) => void;
  onTaskEscalated: (task: RetryableTask, reason: string) => void;
}

// ============================================
// Storage Interface
// ============================================

/**
 * Interface for task storage.
 */
export interface TaskStorage {
  save(task: RetryableTask): Promise<void>;
  get(id: string): Promise<RetryableTask | null>;
  getAll(status?: RetryStatus): Promise<RetryableTask[]>;
  getPending(): Promise<RetryableTask[]>;
  update(task: RetryableTask): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory storage for development/testing.
 */
export class InMemoryTaskStorage implements TaskStorage {
  private tasks: Map<string, RetryableTask> = new Map();

  async save(task: RetryableTask): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async get(id: string): Promise<RetryableTask | null> {
    return this.tasks.get(id) ?? null;
  }

  async getAll(status?: RetryStatus): Promise<RetryableTask[]> {
    const all = Array.from(this.tasks.values());
    if (status) {
      return all.filter((t) => t.status === status);
    }
    return all;
  }

  async getPending(): Promise<RetryableTask[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'failed_retrying'
    );
  }

  async update(task: RetryableTask): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('ECONNRESET')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.message.includes('fetch failed')) return true;

    // Rate limiting
    if (error.message.includes('429')) return true;
    if (error.message.includes('rate limit')) return true;

    // Server errors
    if (error.message.includes('500')) return true;
    if (error.message.includes('502')) return true;
    if (error.message.includes('503')) return true;
    if (error.message.includes('504')) return true;

    // Temporary failures
    if (error.message.includes('temporarily')) return true;
    if (error.message.includes('try again')) return true;
  }

  return false;
}

/**
 * Calculate the delay for the next retry attempt.
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

// ============================================
// Retry Handler Class
// ============================================

/**
 * RetryHandler implements delay-retry behavior for tasks.
 * Tasks are retried with exponential backoff until they succeed
 * or are escalated to human review after max retries.
 */
export class RetryHandler {
  private storage: TaskStorage;
  private config: RetryConfig;
  private eventHandlers: Partial<RetryHandlerEvents> = {};

  constructor(
    storage: TaskStorage = new InMemoryTaskStorage(),
    config: RetryConfig = DEFAULT_SAFE_AUTONOMY_CONFIG.retry
  ) {
    this.storage = storage;
    this.config = config;
  }

  /**
   * Register event handlers.
   */
  on<K extends keyof RetryHandlerEvents>(
    event: K,
    handler: RetryHandlerEvents[K]
  ): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Create a new retryable task.
   */
  async createTask<T>(options: CreateTaskOptions<T>): Promise<RetryableTask<T>> {
    const task: RetryableTask<T> = {
      id: randomUUID(),
      name: options.name,
      payload: options.payload,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    };

    await this.storage.save(task as RetryableTask);
    this.eventHandlers.onTaskCreated?.(task as RetryableTask);

    return task;
  }

  /**
   * Execute a function with retry logic.
   */
  async executeWithRetry<T, R>(
    fn: RetryableFunction<T, R>,
    payload: T,
    taskName: string = 'unnamed_task'
  ): Promise<RetryResult<R>> {
    const task = await this.createTask({ name: taskName, payload });
    return this.runTask(task, fn);
  }

  /**
   * Run a task with retry logic.
   */
  async runTask<T, R>(
    task: RetryableTask<T>,
    fn: RetryableFunction<T, R>
  ): Promise<RetryResult<R>> {
    task.status = 'executing';
    await this.storage.update(task as RetryableTask);
    this.eventHandlers.onTaskStarted?.(task as RetryableTask);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        task.lastAttemptAt = new Date();
        task.retryCount = attempt;
        await this.storage.update(task as RetryableTask);

        const result = await fn(task.payload);

        task.status = 'succeeded';
        task.completedAt = new Date();
        task.result = result;
        await this.storage.update(task as RetryableTask);
        this.eventHandlers.onTaskSucceeded?.(task as RetryableTask, result);

        return {
          success: true,
          result,
          attempts: attempt + 1,
          escalated: false,
          finalStatus: 'succeeded',
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        task.lastError = lastError.message;
        await this.storage.update(task as RetryableTask);

        // Check if error is retryable
        if (!isRetryableError(error) || attempt >= this.config.maxRetries) {
          break;
        }

        // Calculate backoff and wait
        const delay = calculateBackoff(attempt, this.config);
        task.status = 'failed_retrying';
        task.nextAttemptAt = new Date(Date.now() + delay);
        await this.storage.update(task as RetryableTask);
        this.eventHandlers.onTaskRetry?.(task as RetryableTask, attempt + 1, lastError);

        await sleep(delay);
      }
    }

    // Max retries exhausted - escalate to human
    task.status = 'escalated';
    task.completedAt = new Date();
    await this.storage.update(task as RetryableTask);
    this.eventHandlers.onTaskEscalated?.(
      task as RetryableTask,
      `Max retries (${this.config.maxRetries}) exhausted`
    );

    return {
      success: false,
      error: lastError,
      attempts: task.retryCount + 1,
      escalated: true,
      finalStatus: 'escalated',
    };
  }

  /**
   * Resume a failed task.
   */
  async resumeTask<T, R>(
    taskId: string,
    fn: RetryableFunction<T, R>
  ): Promise<RetryResult<R>> {
    const task = (await this.storage.get(taskId)) as RetryableTask<T> | null;
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'failed_retrying' && task.status !== 'escalated') {
      throw new Error(`Task cannot be resumed with status: ${task.status}`);
    }

    // Reset retry count for resumed tasks
    task.retryCount = 0;
    task.status = 'pending';
    task.lastError = undefined;
    await this.storage.update(task as RetryableTask);

    return this.runTask(task, fn);
  }

  /**
   * Get all pending tasks that need to be processed.
   */
  async getPendingTasks(): Promise<RetryableTask[]> {
    return this.storage.getPending();
  }

  /**
   * Get tasks that are due for retry.
   */
  async getDueForRetry(): Promise<RetryableTask[]> {
    const pending = await this.storage.getPending();
    const now = Date.now();

    return pending.filter((task) => {
      if (!task.nextAttemptAt) return task.status === 'pending';
      return task.nextAttemptAt.getTime() <= now;
    });
  }

  /**
   * Get a task by ID.
   */
  async getTask(id: string): Promise<RetryableTask | null> {
    return this.storage.get(id);
  }

  /**
   * Get all escalated tasks.
   */
  async getEscalatedTasks(): Promise<RetryableTask[]> {
    return this.storage.getAll('escalated');
  }

  /**
   * Mark an escalated task as resolved.
   */
  async resolveEscalatedTask(
    taskId: string,
    result: unknown
  ): Promise<RetryableTask> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'escalated') {
      throw new Error(`Task is not escalated: ${task.status}`);
    }

    task.status = 'succeeded';
    task.completedAt = new Date();
    task.result = result;
    await this.storage.update(task);

    return task;
  }

  /**
   * Get the current retry configuration.
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update the retry configuration.
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new RetryHandler instance.
 */
export function createRetryHandler(
  storage?: TaskStorage,
  config?: RetryConfig
): RetryHandler {
  return new RetryHandler(storage, config);
}

/**
 * Get the default retry configuration.
 */
export function getDefaultRetryConfig(): RetryConfig {
  return {
    maxRetries: 10,
    initialDelayMs: 1000,
    maxDelayMs: 3600000, // 1 hour
    backoffMultiplier: 2,
  };
}

/**
 * Execute a one-off function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig: RetryConfig = {
    ...getDefaultRetryConfig(),
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt >= fullConfig.maxRetries) {
        throw lastError;
      }

      const delay = calculateBackoff(attempt, fullConfig);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

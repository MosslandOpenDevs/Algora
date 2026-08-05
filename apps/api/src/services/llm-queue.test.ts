/**
 * Admission control on the shared LLM request queue.
 *
 * Anyone who could open a socket could enqueue agent-response work, and enqueue
 * accepted every request unconditionally. Since the queue serves at most one
 * request per minDelayMs, a flood could not make the system do more work — it
 * just accumulated pending promises that would never be serviced in any useful
 * time, starving legitimate deliberation behind a backlog.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  globalLLMQueue,
  LLM_QUEUE_MAX_DEPTH,
  LLMQueueFullError,
} from './agora';

describe('LLM request queue admission', () => {
  beforeEach(() => {
    globalLLMQueue.clear();
    // No processor is registered in this test, so nothing drains: every accepted
    // request stays queued and depth is exactly what we enqueued.
    globalLLMQueue.setMaxDepth(3);
  });

  afterEach(() => {
    globalLLMQueue.clear();
    globalLLMQueue.setMaxDepth(LLM_QUEUE_MAX_DEPTH);
  });

  it('accepts requests up to the configured depth', () => {
    for (let i = 0; i < 3; i++) {
      // Nothing drains the queue here, so these promises stay pending by design.
      void globalLLMQueue.enqueue(`session-${i}`, 'agent-1').catch(() => {});
    }

    expect(globalLLMQueue.getQueueSize()).toBe(3);
  });

  it('rejects once the queue is full instead of growing without bound', async () => {
    for (let i = 0; i < 3; i++) {
      void globalLLMQueue.enqueue(`session-${i}`, 'agent-1').catch(() => {});
    }

    await expect(
      globalLLMQueue.enqueue('session-overflow', 'agent-1')
    ).rejects.toBeInstanceOf(LLMQueueFullError);
    expect(globalLLMQueue.getQueueSize()).toBe(3);
  });

  it('rejects with a message naming the queue depth', async () => {
    for (let i = 0; i < 3; i++) {
      void globalLLMQueue.enqueue(`session-${i}`, 'agent-1').catch(() => {});
    }

    await expect(
      globalLLMQueue.enqueue('session-overflow', 'agent-1')
    ).rejects.toThrow(/queue is full/i);
  });

  it('accepts again after the backlog is cleared', async () => {
    for (let i = 0; i < 3; i++) {
      void globalLLMQueue.enqueue(`session-${i}`, 'agent-1').catch(() => {});
    }
    await expect(
      globalLLMQueue.enqueue('rejected', 'agent-1')
    ).rejects.toBeInstanceOf(LLMQueueFullError);

    globalLLMQueue.clear();
    void globalLLMQueue.enqueue('session-after', 'agent-1').catch(() => {});

    expect(globalLLMQueue.getQueueSize()).toBe(1);
  });

  it('ships with a finite default depth', () => {
    expect(LLM_QUEUE_MAX_DEPTH).toBeGreaterThan(0);
    expect(Number.isFinite(LLM_QUEUE_MAX_DEPTH)).toBe(true);
  });
});

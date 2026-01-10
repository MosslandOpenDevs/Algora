'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  loadingMessages,
  agentActivityMessages,
  signalMessages,
  sessionMessages,
  emptyStateMessages,
  getRandomMessage,
} from '@/lib/wittyMessages';

type MessageCategory =
  | 'loading'
  | 'agent'
  | 'signal'
  | 'session-starting'
  | 'session-active'
  | 'session-concluding'
  | 'empty-sessions'
  | 'empty-signals'
  | 'empty-agents';

const categoryToMessages: Record<MessageCategory, string[]> = {
  loading: loadingMessages,
  agent: agentActivityMessages,
  signal: signalMessages,
  'session-starting': sessionMessages.starting,
  'session-active': sessionMessages.active,
  'session-concluding': sessionMessages.concluding,
  'empty-sessions': emptyStateMessages.noSessions,
  'empty-signals': emptyStateMessages.noSignals,
  'empty-agents': emptyStateMessages.noAgents,
};

interface UseWittyMessageOptions {
  /** Message category */
  category?: MessageCategory;
  /** Custom messages array */
  messages?: string[];
  /** Cycle interval in ms (0 = no cycling) */
  interval?: number;
  /** Whether to start cycling immediately */
  enabled?: boolean;
}

/**
 * Hook for displaying witty, rotating messages
 *
 * @example
 * // Simple usage with default loading messages
 * const message = useWittyMessage();
 *
 * @example
 * // Cycling messages every 3 seconds
 * const message = useWittyMessage({ category: 'signal', interval: 3000 });
 *
 * @example
 * // Custom messages
 * const message = useWittyMessage({ messages: ['Custom 1', 'Custom 2'] });
 */
export function useWittyMessage(options: UseWittyMessageOptions = {}) {
  const {
    category = 'loading',
    messages: customMessages,
    interval = 0,
    enabled = true,
  } = options;

  const messagePool = customMessages || categoryToMessages[category];

  // Use first message as initial value to avoid hydration mismatch
  // (Math.random() gives different results on server vs client)
  const [message, setMessage] = useState(messagePool[0]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    setMessage(getRandomMessage(messagePool));
  }, [messagePool]);

  // Set mounted and randomize initial message on client
  useEffect(() => {
    setMounted(true);
    refresh();
  }, []);

  // Cycle messages if interval is set
  useEffect(() => {
    if (!mounted || !enabled || interval <= 0) return;

    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [mounted, enabled, interval, refresh]);

  // Refresh on category change (only after mount)
  useEffect(() => {
    if (mounted) {
      refresh();
    }
  }, [category, mounted, refresh]);

  return { message, refresh };
}

/**
 * Hook for loading states with witty messages
 */
export function useLoadingMessage(interval: number = 2500) {
  return useWittyMessage({ category: 'loading', interval });
}

/**
 * Hook for agent activity messages
 */
export function useAgentMessage(interval: number = 3000) {
  return useWittyMessage({ category: 'agent', interval });
}

/**
 * Hook for signal-related messages
 */
export function useSignalMessage(interval: number = 2000) {
  return useWittyMessage({ category: 'signal', interval });
}

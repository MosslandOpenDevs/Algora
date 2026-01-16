/**
 * Server-side API utilities for React Server Components
 * These functions run on the server and can be used in async Server Components
 *
 * IMPORTANT: Always use internal localhost URL for server-side requests.
 * Using external URL (https://algora.moss.land) causes circular request blocking
 * because the request goes through nginx back to the same server.
 */

import { type Stats, type Agent, type Activity } from './api';

// CRITICAL: Use internal localhost URL to avoid circular requests through nginx
// This prevents the "7-11 second TTFB" issue where static files queue behind SSR
const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:3201';

// Request timeout to prevent blocking (3 seconds max)
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Server-side fetch with timeout, caching, and error handling
 */
async function serverFetch<T>(
  endpoint: string,
  options?: {
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
  }
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const timeout = options?.timeout ?? REQUEST_TIMEOUT_MS;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      next: {
        revalidate: options?.revalidate ?? 10,
        tags: options?.tags,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[server-api] Error ${response.status} for ${endpoint}`);
      throw new Error(`Server API Error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[server-api] Timeout after ${timeout}ms for ${endpoint}`);
      throw new Error(`Request timeout: ${endpoint}`);
    }
    throw error;
  }
}

/**
 * Fetch dashboard stats (server-side)
 */
export async function getStats(): Promise<Stats> {
  try {
    return await serverFetch<Stats>('/api/stats', {
      revalidate: 10,
      tags: ['stats'],
    });
  } catch (error) {
    console.error('Failed to fetch stats on server:', error);
    return {
      activeAgents: 0,
      activeSessions: 0,
      signalsToday: 0,
      openIssues: 0,
    };
  }
}

/**
 * Fetch agents list (server-side)
 */
export async function getAgents(): Promise<Agent[]> {
  try {
    const response = await serverFetch<{ agents: Agent[] }>('/api/agents', {
      revalidate: 30,
      tags: ['agents'],
    });
    return response.agents || [];
  } catch (error) {
    console.error('Failed to fetch agents on server:', error);
    return [];
  }
}

/**
 * Fetch recent activities (server-side)
 */
export async function getActivities(limit = 25): Promise<Activity[]> {
  try {
    const response = await serverFetch<{ activities: Activity[] }>(
      `/api/activity?limit=${limit}`,
      {
        revalidate: 15,
        tags: ['activities'],
      }
    );
    return response.activities || [];
  } catch (error) {
    console.error('Failed to fetch activities on server:', error);
    return [];
  }
}

/**
 * Fetch all dashboard data in parallel (optimized for initial load)
 */
export async function getDashboardData() {
  const [stats, agents, activities] = await Promise.all([
    getStats(),
    getAgents(),
    getActivities(25),
  ]);

  return { stats, agents, activities };
}

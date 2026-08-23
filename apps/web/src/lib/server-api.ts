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
 * Server-side fetch with timeout and error handling.
 *
 * Deliberately uncached. `next: { revalidate: N }` does not mean "at most N
 * seconds old": past N seconds the entry is stale, and the next visitor is
 * served that stale entry while the refresh happens behind them. On a quiet
 * site the age of what they see is the time since the previous visitor, not N.
 *
 * Measured on production while this was set to 10: 14-30s behind the API under
 * steady traffic, 99s on a cold hit, and an hour on a page opened in a browser.
 * For a dashboard whose activity feed is meant never to pause for more than ten
 * seconds, that is the wrong layer to hold freshness in.
 *
 * The API memoises these endpoints itself — stats and activities for 15s,
 * agents for 30s — so dropping this cache does not add database load, and makes
 * that TTL the real bound rather than a floor nobody was holding. React Query
 * takes over after hydration; this only governs the first paint.
 */
async function serverFetch<T>(
  endpoint: string,
  options?: {
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
      cache: 'no-store',
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
    return await serverFetch<Stats>('/api/stats');
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
    const response = await serverFetch<{ agents: Agent[] }>('/api/agents');
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
      `/api/activity?limit=${limit}`
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

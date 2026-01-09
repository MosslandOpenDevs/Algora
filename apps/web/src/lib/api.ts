const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export interface Stats {
  activeAgents: number;
  activeSessions: number;
  signalsToday: number;
  openIssues: number;
  agentsTrend?: number;
  sessionsTrend?: number;
  signalsTrend?: number;
}

export interface Agent {
  id: string;
  name: string;
  persona: string;
  cluster: string;
  color: string;
  state: 'idle' | 'active' | 'speaking' | 'listening';
  avatar?: string;
}

export interface Activity {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AgoraSession {
  id: string;
  topic: string;
  status: 'pending' | 'active' | 'concluded';
  participants: string[];
  createdAt: string;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

export async function fetchStats(): Promise<Stats> {
  return fetchAPI<Stats>('/api/stats');
}

export async function fetchAgents(): Promise<Agent[]> {
  return fetchAPI<Agent[]>('/api/agents');
}

export async function fetchActivities(limit = 20): Promise<Activity[]> {
  return fetchAPI<Activity[]>(`/api/activity?limit=${limit}`);
}

export async function fetchAgoraSessions(): Promise<AgoraSession[]> {
  return fetchAPI<AgoraSession[]>('/api/agora/sessions');
}

export async function summonAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/summon`, { method: 'POST' });
}

export async function dismissAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/dismiss`, { method: 'POST' });
}

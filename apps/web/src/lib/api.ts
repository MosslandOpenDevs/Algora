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
  display_name: string;
  group_name: string;
  persona_prompt: string;
  color: string;
  status: 'idle' | 'active' | 'speaking' | 'listening' | null;
  avatar_url?: string;
}

export interface Activity {
  id: string;
  type: string;
  severity: string;
  timestamp: string;
  message: string;
  agent_id: string | null;
  details: string | null;
  metadata: string | null;
  created_at: string;
}

export interface AgoraSession {
  id: string;
  topic: string;
  status: 'pending' | 'active' | 'concluded';
  participants: string[];
  createdAt: string;
}

export interface Signal {
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
  created_at: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'detected' | 'confirmed' | 'in_progress' | 'resolved' | 'dismissed';
  detected_at: string;
  resolved_at: string | null;
  signal_ids: string | null;
  evidence: string | null;
  suggested_actions: string | null;
  decision_packet: string | null;
  created_at: string;
  updated_at: string;
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
  const response = await fetchAPI<{ agents: Agent[] }>('/api/agents');
  return response.agents || [];
}

export async function fetchActivities(limit = 20): Promise<Activity[]> {
  const response = await fetchAPI<{ activities: Activity[] }>(`/api/activity?limit=${limit}`);
  return response.activities || [];
}

export async function fetchAgoraSessions(): Promise<AgoraSession[]> {
  const response = await fetchAPI<{ sessions: AgoraSession[] }>('/api/agora/sessions');
  return response.sessions || [];
}

export async function summonAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/summon`, { method: 'POST' });
}

export async function dismissAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/dismiss`, { method: 'POST' });
}

export async function fetchSignals(limit = 50, source?: string, severity?: string): Promise<Signal[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (source && source !== 'all') params.append('source', source);
  if (severity && severity !== 'all') params.append('severity', severity);
  const response = await fetchAPI<{ signals: Signal[]; total: number }>(`/api/signals?${params}`);
  return response.signals || [];
}

export async function fetchIssues(
  limit = 50,
  status?: string,
  priority?: string,
  category?: string
): Promise<Issue[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (status && status !== 'all') params.append('status', status);
  if (priority && priority !== 'all') params.append('priority', priority);
  if (category && category !== 'all') params.append('category', category);
  const response = await fetchAPI<{ issues: Issue[] }>(`/api/issues?${params}`);
  return response.issues || [];
}

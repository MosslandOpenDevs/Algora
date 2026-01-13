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
  title: string;
  description: string;
  issue_id: string | null;
  status: 'pending' | 'active' | 'concluded' | 'completed';
  current_round: number;
  max_rounds: number;
  summoned_agents: string | null;
  human_participants: string | null;
  consensus_score: number | null;
  created_at: string;
  updated_at: string;
  concluded_at: string | null;
  issue_title?: string;
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

export interface AgoraMessage {
  id: string;
  session_id: string;
  agent_id: string | null;
  human_id: string | null;
  message_type: string;
  content: string;
  evidence: string | null;
  tier_used: number;
  created_at: string;
  agent_name?: string;
  display_name?: string;
  color?: string;
}

export interface SessionWithMessages {
  session: AgoraSession;
  messages: AgoraMessage[];
}

export async function fetchSessionWithMessages(sessionId: string): Promise<SessionWithMessages> {
  return fetchAPI<SessionWithMessages>(`/api/agora/sessions/${sessionId}`);
}

export async function sendAgoraMessage(
  sessionId: string,
  content: string,
  humanId?: string
): Promise<AgoraMessage> {
  const response = await fetchAPI<{ message: AgoraMessage }>(`/api/agora/sessions/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      messageType: 'human',
      humanId: humanId || 'anonymous',
    }),
  });
  return response.message;
}

export async function summonAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/summon`, { method: 'POST' });
}

export async function dismissAgent(agentId: string): Promise<void> {
  await fetchAPI(`/api/agents/${agentId}/dismiss`, { method: 'POST' });
}

export interface SignalsResponse {
  signals: Signal[];
  total: number;
}

export async function fetchSignals(limit = 50, source?: string, severity?: string): Promise<SignalsResponse> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (source && source !== 'all') params.append('source', source);
  if (severity && severity !== 'all') params.append('severity', severity);
  const response = await fetchAPI<{ signals: Signal[]; total: number }>(`/api/signals?${params}`);
  return { signals: response.signals || [], total: response.total || 0 };
}

// Live signal statistics for dynamic dashboard
export interface LiveSignalStats {
  timeStats: {
    last10min: number;
    lastHour: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    total: number;
  };
  hourlyBreakdown: Array<{ hour: string; count: number }>;
  minuteBreakdown: Array<{ minute: string; count: number }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
  ratePerMinute: number;
  timestamp: string;
}

export async function fetchLiveSignalStats(): Promise<LiveSignalStats> {
  return fetchAPI<LiveSignalStats>('/api/signals/live-stats');
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

// ============================================
// Governance OS v2.0 API Types & Functions
// ============================================

// Pipeline Types
export type PipelineStage =
  | 'signal_intake'
  | 'issue_detection'
  | 'triage'
  | 'research'
  | 'deliberation'
  | 'decision_packet'
  | 'voting'
  | 'execution'
  | 'outcome_verification';

export interface PipelineStatus {
  issueId: string;
  currentStage: PipelineStage;
  stagesCompleted: PipelineStage[];
  progress: number; // 0-100
  startedAt: string;
  updatedAt: string;
  error?: string;
}

// Document Types
export type DocumentType =
  | 'DP' | 'GP' | 'RM' | 'RC' | 'WGC' | 'WGR'
  | 'ER' | 'PP' | 'PA' | 'DGP' | 'DG' | 'MR' | 'RR' | 'DR' | 'AR'
  | 'RD' | 'TA';

export type DocumentState =
  | 'draft' | 'pending_review' | 'in_review'
  | 'approved' | 'published' | 'superseded' | 'archived' | 'rejected';

export interface GovernanceDocument {
  id: string;
  type: DocumentType;
  title: string;
  summary: string;
  state: DocumentState;
  version: { major: number; minor: number; patch: number };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  issueId?: string;
  contentHash: string;
}

// Voting Types
export type HouseType = 'mosscoin' | 'opensource';

export interface DualHouseVote {
  id: string;
  proposalId: string;
  title: string;
  status: 'pending' | 'voting' | 'passed' | 'rejected' | 'reconciliation';
  mossCoinHouse: {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    quorumReached: boolean;
    passed?: boolean;
  };
  openSourceHouse: {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    quorumReached: boolean;
    passed?: boolean;
  };
  createdAt: string;
  expiresAt: string;
}

// Safe Autonomy Types
export type RiskLevel = 'LOW' | 'MID' | 'HIGH';

export interface LockedAction {
  id: string;
  actionType: string;
  riskLevel: RiskLevel;
  status: 'locked' | 'approved' | 'rejected' | 'executed';
  lockReason: string;
  requiredApprovals: string[];
  receivedApprovals: string[];
  createdAt: string;
  documentId?: string;
}

// Workflow Types
export type WorkflowType = 'A' | 'B' | 'C' | 'D' | 'E';

export interface WorkflowStatus {
  type: WorkflowType;
  name: string;
  description: string;
  activeCount: number;
  completedToday: number;
  pendingApproval: number;
}

// Stats Types
export interface GovernanceOSStats {
  uptime: number;
  pipelinesRunning: number;
  pipelinesCompleted: number;
  documentsPublished: number;
  votingSessions: number;
  lockedActions: number;
  llmCostsToday: number;
  lastHeartbeat: string;
}

export interface GovernanceOSHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    name: string;
    status: 'up' | 'down' | 'degraded';
    lastCheck: string;
  }[];
}

// API Functions
export async function fetchGovernanceOSStats(): Promise<GovernanceOSStats> {
  const response = await fetchAPI<{ stats: GovernanceOSStats }>('/api/governance-os/stats');
  return response.stats;
}

export async function fetchGovernanceOSHealth(): Promise<GovernanceOSHealth> {
  return fetchAPI<GovernanceOSHealth>('/api/governance-os/health');
}

export async function fetchPipelineStatus(issueId: string): Promise<PipelineStatus> {
  return fetchAPI<PipelineStatus>(`/api/governance-os/pipeline/issue/${issueId}`);
}

export async function fetchDocuments(
  type?: DocumentType,
  state?: DocumentState,
  limit = 50
): Promise<GovernanceDocument[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (type) params.append('type', type);
  if (state) params.append('state', state);
  const response = await fetchAPI<{ documents: GovernanceDocument[]; total: number }>(
    `/api/governance-os/documents?${params}`
  );
  return response.documents || [];
}

export async function fetchDocument(documentId: string): Promise<GovernanceDocument> {
  const response = await fetchAPI<{ document: GovernanceDocument }>(`/api/governance-os/documents/${documentId}`);
  return response.document;
}

export async function fetchDualHouseVotes(status?: string): Promise<DualHouseVote[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetchAPI<{ sessions: DualHouseVote[]; total: number }>(
    `/api/governance-os/voting${queryString}`
  );
  return response.sessions || [];
}

export async function fetchLockedActions(status?: string): Promise<LockedAction[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetchAPI<{ actions: LockedAction[]; total: number }>(
    `/api/governance-os/approvals${queryString}`
  );
  return response.actions || [];
}

export async function fetchWorkflowStatuses(): Promise<WorkflowStatus[]> {
  const response = await fetchAPI<{ workflows: WorkflowStatus[] }>('/api/governance-os/workflows');
  return response.workflows || [];
}

export async function approveLockedAction(actionId: string, approverId: string): Promise<void> {
  await fetchAPI(`/api/governance-os/approvals/${actionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approverId }),
  });
}

export async function castDualHouseVote(
  sessionId: string,
  house: HouseType,
  vote: 'for' | 'against' | 'abstain',
  voterId: string,
  votingPower: number
): Promise<void> {
  await fetchAPI(`/api/governance-os/voting/${sessionId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ house, vote, voterId, votingPower }),
  });
}

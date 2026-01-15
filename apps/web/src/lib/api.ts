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
  summary?: string;
  status: 'pending' | 'voting' | 'passed' | 'rejected' | 'reconciliation';
  riskLevel?: RiskLevel;
  mossCoinHouse: {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    quorumReached: boolean;
    quorumThreshold: number;
    passThreshold: number;
    totalVoters?: number;
    passed?: boolean;
  };
  openSourceHouse: {
    votesFor: number;
    votesAgainst: number;
    votesAbstain: number;
    quorumReached: boolean;
    quorumThreshold: number;
    passThreshold: number;
    totalVoters?: number;
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
  uptime: number; // in seconds
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

// Backend Stats response (different from frontend interface)
interface BackendStats {
  uptimeHours: number;
  totalPipelines: number;
  successfulPipelines: number;
  failedPipelines: number;
  pendingApprovals: number;
  lockedActions: number;
  documentsProduced: number;
  votingSessions: number;
  llmCostTodayUsd: number;
  llmTokensToday: number;
}

// Backend Health response
interface BackendHealth {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  components: Record<string, boolean>;
}

// API Functions
export async function fetchGovernanceOSStats(): Promise<GovernanceOSStats> {
  const response = await fetchAPI<{ stats: BackendStats }>('/api/governance-os/stats');
  const stats = response.stats;

  // Transform backend response to frontend format
  return {
    uptime: stats.uptimeHours * 3600, // Convert hours to seconds
    pipelinesRunning: Math.max(0, stats.totalPipelines - stats.successfulPipelines - stats.failedPipelines),
    pipelinesCompleted: stats.successfulPipelines,
    documentsPublished: stats.documentsProduced,
    votingSessions: stats.votingSessions,
    lockedActions: stats.lockedActions,
    llmCostsToday: stats.llmCostTodayUsd,
    lastHeartbeat: new Date().toISOString(),
  };
}

export async function fetchGovernanceOSHealth(): Promise<GovernanceOSHealth> {
  const response = await fetchAPI<BackendHealth>('/api/governance-os/health');

  // Transform backend response to frontend format
  return {
    status: response.status,
    components: Object.entries(response.components).map(([name, isUp]) => ({
      name,
      status: isUp ? 'up' : 'down',
      lastCheck: new Date().toISOString(),
    })),
  };
}

export async function fetchPipelineStatus(issueId: string): Promise<PipelineStatus> {
  return fetchAPI<PipelineStatus>(`/api/governance-os/pipeline/issue/${issueId}`);
}

// Backend document response (different field names)
interface BackendDocument {
  id: string;
  type: DocumentType;
  title: string;
  summary: string;
  state: DocumentState;
  version: { major: number; minor: number; patch: number };
  createdAt: string;
  modifiedAt: string; // Backend uses modifiedAt, frontend uses updatedAt
  createdBy: string;
  issueId?: string;
  contentHash: string;
}

export async function fetchDocuments(
  type?: DocumentType,
  state?: DocumentState,
  limit = 50
): Promise<GovernanceDocument[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (type) params.append('type', type);
  if (state) params.append('state', state);
  const response = await fetchAPI<{ documents: BackendDocument[]; total: number }>(
    `/api/governance-os/documents?${params}`
  );

  // Transform backend response to frontend format
  return (response.documents || []).map((doc) => ({
    id: doc.id,
    type: doc.type,
    title: doc.title,
    summary: doc.summary,
    state: doc.state,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.modifiedAt || doc.createdAt, // Map modifiedAt to updatedAt
    createdBy: doc.createdBy,
    issueId: doc.issueId,
    contentHash: doc.contentHash,
  }));
}

export async function fetchDocument(documentId: string): Promise<GovernanceDocument> {
  const response = await fetchAPI<{ document: BackendDocument }>(`/api/governance-os/documents/${documentId}`);
  const doc = response.document;

  // Transform backend response to frontend format
  return {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    summary: doc.summary,
    state: doc.state,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.modifiedAt || doc.createdAt, // Map modifiedAt to updatedAt
    createdBy: doc.createdBy,
    issueId: doc.issueId,
    contentHash: doc.contentHash,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformVoteResponse(vote: any): DualHouseVote {
  return {
    ...vote,
    mossCoinHouse: {
      ...vote.mossCoinHouse,
      quorumThreshold: vote.mossCoinHouse?.quorumThreshold ?? 10,
      passThreshold: vote.mossCoinHouse?.passThreshold ?? 50,
      totalVoters: vote.mossCoinHouse?.totalVoters ?? vote.mossCoinHouse?.totalPossiblePower ?? 100,
    },
    openSourceHouse: {
      ...vote.openSourceHouse,
      quorumThreshold: vote.openSourceHouse?.quorumThreshold ?? 20,
      passThreshold: vote.openSourceHouse?.passThreshold ?? 50,
      totalVoters: vote.openSourceHouse?.totalVoters ?? vote.openSourceHouse?.totalPossiblePower ?? 100,
    },
  };
}

export async function fetchDualHouseVotes(status?: string): Promise<DualHouseVote[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  const queryString = params.toString() ? `?${params.toString()}` : '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await fetchAPI<{ sessions: any[]; total: number }>(
    `/api/governance-os/voting${queryString}`
  );
  return (response.sessions || []).map(transformVoteResponse);
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

// ============================================
// Proposals API Types & Functions
// ============================================

export type ProposalStatus =
  | 'draft'
  | 'pending_review'
  | 'discussion'
  | 'voting'
  | 'passed'
  | 'rejected'
  | 'executed'
  | 'cancelled';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  proposer_type: 'human' | 'agent' | 'system';
  status: ProposalStatus;
  category: string;
  priority: string;
  issue_id?: string;
  decision_packet?: string;
  voting_starts?: string;
  voting_ends?: string;
  quorum_required: number;
  approval_threshold: number;
  tally?: string;
  execution_tx?: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalTally {
  for: number;
  against: number;
  abstain: number;
  total: number;
}

export interface ProposalsResponse {
  proposals: Proposal[];
}

export async function fetchProposals(
  status?: ProposalStatus,
  category?: string,
  limit = 50,
  offset = 0
): Promise<Proposal[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  if (status) params.append('status', status);
  if (category) params.append('category', category);
  const response = await fetchAPI<ProposalsResponse>(`/api/proposals?${params}`);
  return response.proposals || [];
}

export async function fetchProposal(id: string): Promise<Proposal | null> {
  try {
    const response = await fetchAPI<{ proposal: Proposal }>(`/api/proposals/${id}`);
    return response.proposal;
  } catch {
    return null;
  }
}

export async function fetchProposalVotes(id: string): Promise<{ votes: any[]; tally: ProposalTally }> {
  return fetchAPI<{ votes: any[]; tally: ProposalTally }>(`/api/proposals/${id}/votes`);
}

export async function createProposal(data: {
  title: string;
  description: string;
  proposer: string;
  category?: string;
  priority?: string;
  issueId?: string;
}): Promise<Proposal> {
  const response = await fetchAPI<{ proposal: Proposal }>('/api/proposals', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.proposal;
}

export async function castProposalVote(
  proposalId: string,
  voter: string,
  choice: 'for' | 'against' | 'abstain',
  reason?: string
): Promise<{ vote: any; tally: ProposalTally }> {
  return fetchAPI<{ vote: any; tally: ProposalTally }>(`/api/proposals/${proposalId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ voter, voterType: 'human', choice, reason }),
  });
}

// Decision Packet Types
export interface DecisionPacketContent {
  summary: string;
  context: string;
  options: Array<{
    id: string;
    title: string;
    description: string;
    pros: string[];
    cons: string[];
    recommendation?: boolean;
  }>;
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
    mitigations: string[];
  };
  stakeholderImpact: Array<{
    group: string;
    impact: string;
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
  recommendation: {
    choice: string;
    rationale: string;
    confidence: number;
  };
  agentContributions?: Array<{
    agentId: string;
    agentName: string;
    perspective: string;
    vote?: 'for' | 'against' | 'abstain';
  }>;
}

export interface DecisionPacket {
  id: string;
  proposalId: string;
  version: number;
  content: DecisionPacketContent;
  summary: string;
  generatedAt: string;
  generatedBy: string;
  modelUsed?: string;
}

export interface ProposalVote {
  id: string;
  proposalId: string;
  voter: string;
  voterType: 'human' | 'agent';
  choice: 'for' | 'against' | 'abstain';
  weight: number;
  reason?: string;
  createdAt: string;
}

export async function fetchDecisionPacket(proposalId: string): Promise<DecisionPacket | null> {
  try {
    const response = await fetchAPI<{ packet: any }>(`/api/proposals/${proposalId}/decision-packet`);
    if (!response.packet) return null;
    return {
      id: response.packet.id,
      proposalId: response.packet.proposal_id,
      version: response.packet.version,
      content: typeof response.packet.content === 'string'
        ? JSON.parse(response.packet.content)
        : response.packet.content,
      summary: response.packet.summary,
      generatedAt: response.packet.generated_at,
      generatedBy: response.packet.generated_by,
      modelUsed: response.packet.model_used,
    };
  } catch {
    return null;
  }
}

export async function fetchProposalVoteHistory(proposalId: string): Promise<ProposalVote[]> {
  try {
    const response = await fetchAPI<{ votes: any[] }>(`/api/proposals/${proposalId}/votes`);
    return (response.votes || []).map(v => ({
      id: v.id,
      proposalId: v.proposal_id,
      voter: v.voter,
      voterType: v.voter_type || 'human',
      choice: v.choice,
      weight: v.weight,
      reason: v.reason,
      createdAt: v.created_at,
    }));
  } catch {
    return [];
  }
}

export async function fetchIssue(id: string): Promise<Issue | null> {
  try {
    const response = await fetchAPI<{ issue: Issue }>(`/api/issues/${id}`);
    return response.issue;
  } catch {
    return null;
  }
}

// ============================================
// Disclosure API Types & Functions
// ============================================

export type DisclosureReportType = 'quarterly' | 'annual' | 'incident' | 'audit';
export type DisclosureReportStatus = 'draft' | 'pending' | 'published';

export interface DisclosureReport {
  id: string;
  title: string;
  type: DisclosureReportType;
  status: DisclosureReportStatus;
  date: string;
  summary: string;
  content?: string;
  file_url?: string;
  author: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface DisclosureStats {
  total: number;
  published: number;
  pending: number;
  draft: number;
  byType: Record<DisclosureReportType, number>;
}

export async function fetchDisclosureReports(
  type?: DisclosureReportType,
  status?: DisclosureReportStatus,
  limit = 50
): Promise<DisclosureReport[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (type) params.append('type', type);
  if (status) params.append('status', status);
  const response = await fetchAPI<{ reports: DisclosureReport[] }>(`/api/disclosure?${params}`);
  return response.reports || [];
}

export async function fetchDisclosureReport(id: string): Promise<DisclosureReport | null> {
  try {
    const response = await fetchAPI<{ report: DisclosureReport }>(`/api/disclosure/${id}`);
    return response.report;
  } catch {
    return null;
  }
}

export async function fetchDisclosureStats(): Promise<DisclosureStats> {
  const response = await fetchAPI<{ stats: DisclosureStats }>('/api/disclosure/stats');
  return response.stats;
}

// ==========================================
// Token/Wallet API
// ==========================================

export interface TokenHolder {
  id: string;
  walletAddress: string;
  userId?: string;
  balance: string;
  votingPower: number;
  verifiedAt?: string;
  lastBalanceCheck?: string;
  isVerified: boolean;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  contractAddress?: string;
}

export interface VerificationRequest {
  nonce: string;
  message: string;
  expiresAt: string;
}

export async function requestWalletVerification(
  walletAddress: string
): Promise<VerificationRequest> {
  const response = await fetchAPI<VerificationRequest>('/api/token/verify/request', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
  return response;
}

export async function confirmWalletVerification(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<TokenHolder> {
  const response = await fetchAPI<{ holder: TokenHolder }>('/api/token/verify/confirm', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, signature, nonce }),
  });
  return response.holder;
}

export async function fetchTokenHolder(walletAddress: string): Promise<TokenHolder | null> {
  try {
    const response = await fetchAPI<{ holder: TokenHolder }>(
      `/api/token/holders/wallet/${walletAddress}`
    );
    return response.holder;
  } catch {
    return null;
  }
}

export async function fetchTokenInfo(): Promise<TokenInfo> {
  const response = await fetchAPI<TokenInfo>('/api/token/info');
  return response;
}

export async function refreshTokenBalance(holderId: string): Promise<TokenHolder> {
  const response = await fetchAPI<{ holder: TokenHolder }>(
    `/api/token/holders/${holderId}/refresh`,
    { method: 'POST' }
  );
  return response.holder;
}

// ==========================================
// Treasury API
// ==========================================

export interface TreasuryBalance {
  tokenAddress: string;
  tokenSymbol: string;
  balance: string;
  balanceFormatted: number;
  usdValue?: number;
}

export interface BudgetAllocation {
  id: string;
  proposalId: string;
  category: string;
  tokenSymbol: string;
  amount: string;
  recipient: string;
  status: 'pending' | 'approved' | 'disbursed' | 'cancelled';
  description: string;
  createdAt: string;
  approvedAt?: string;
  disbursedAt?: string;
  txHash?: string;
}

export interface TreasuryTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'allocation';
  tokenSymbol: string;
  amount: string;
  fromAddress?: string;
  toAddress?: string;
  status: 'pending' | 'confirmed' | 'failed';
  description: string;
  txHash?: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface SpendingLimit {
  id: string;
  category: string;
  tokenAddress: string;
  tokenSymbol: string;
  dailyLimit: string | null;
  weeklyLimit: string | null;
  monthlyLimit: string | null;
  requiresProposal: boolean;
  currentDaily: string;
  currentWeekly: string;
  currentMonthly: string;
}

export interface TreasuryStats {
  totalBalance: number;
  totalAllocations: number;
  pendingAllocations: number;
  approvedAllocations: number;
  disbursedAllocations: number;
  cancelledAllocations: number;
  totalTransactions: number;
  depositsCount: number;
  withdrawalsCount: number;
}

export interface TreasuryDashboard {
  tokenInfo: TokenInfo & { mockMode: boolean };
  token: {
    holders: { total: number; verified: number };
  };
  voting: {
    totalVotes: number;
    totalVotingPowerUsed: number;
    activeVoting: number;
    completedVoting: number;
  };
  treasury: TreasuryStats;
  balances: TreasuryBalance[];
}

export async function fetchTreasuryDashboard(): Promise<TreasuryDashboard> {
  return fetchAPI<TreasuryDashboard>('/api/token/dashboard');
}

export async function fetchTreasuryBalances(): Promise<TreasuryBalance[]> {
  const response = await fetchAPI<{ balances: TreasuryBalance[] }>('/api/token/treasury/balances');
  return response.balances || [];
}

export async function fetchTreasuryStats(): Promise<TreasuryStats> {
  const response = await fetchAPI<{ stats: TreasuryStats }>('/api/token/treasury/stats');
  return response.stats;
}

export async function fetchTreasuryAllocations(
  status?: string,
  limit = 50
): Promise<BudgetAllocation[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (status) params.append('status', status);
  const response = await fetchAPI<BudgetAllocation[]>(`/api/token/treasury/allocations?${params}`);
  return response || [];
}

export async function fetchTreasuryTransactions(
  type?: string,
  limit = 50
): Promise<TreasuryTransaction[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (type) params.append('type', type);
  const response = await fetchAPI<TreasuryTransaction[]>(`/api/token/treasury/transactions?${params}`);
  return response || [];
}

export async function fetchSpendingLimits(): Promise<SpendingLimit[]> {
  const response = await fetchAPI<SpendingLimit[]>('/api/token/treasury/limits');
  return response || [];
}

export async function fetchTokenHolders(limit = 50): Promise<TokenHolder[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  const response = await fetchAPI<TokenHolder[]>(`/api/token/holders?${params}`);
  return response || [];
}

// ==========================================
// Delegation API
// ==========================================

export interface Delegation {
  id: string;
  delegator: string;
  delegate: string;
  categories?: string[];
  weight: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

export interface DelegationResponse {
  delegatedTo: Delegation[];   // Delegations I've given
  delegatedFrom: Delegation[]; // Delegations I've received
}

export async function fetchDelegations(address: string): Promise<DelegationResponse> {
  const response = await fetchAPI<DelegationResponse>(`/api/proposals/delegation/${address}`);
  return {
    delegatedTo: response.delegatedTo || [],
    delegatedFrom: response.delegatedFrom || [],
  };
}

export async function createDelegation(data: {
  delegator: string;
  delegate: string;
  categories?: string[];
  expiresAt?: string;
}): Promise<Delegation> {
  const response = await fetchAPI<{ delegation: Delegation }>('/api/proposals/delegation', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.delegation;
}

export async function revokeDelegation(delegationId: string): Promise<void> {
  await fetchAPI(`/api/proposals/delegation/${delegationId}`, {
    method: 'DELETE',
  });
}

// ===========================================
// Core Types for Algora Platform
// ===========================================

// Agent Types
export type AgentCluster =
  | 'visionaries'
  | 'builders'
  | 'investors'
  | 'guardians'
  | 'operatives'
  | 'moderators'
  | 'advisors'
  // v2.0 Additions
  | 'orchestrators'
  | 'archivists'
  | 'red-team'
  | 'scouts';

export type AgentState = 'idle' | 'active' | 'speaking' | 'listening';

export interface Agent {
  id: string;
  name: string;
  persona: string;
  cluster: AgentCluster;
  color: string;
  idleMessages: string[];
  summoningTags: string[];
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentStateRecord {
  agentId: string;
  state: AgentState;
  sessionId?: string;
  updatedAt: Date;
}

// Agora Types
export type SessionStatus = 'pending' | 'active' | 'concluded';

export interface AgoraSession {
  id: string;
  topic: string;
  summary?: string;
  status: SessionStatus;
  createdAt: Date;
  concludedAt?: Date;
}

export interface AgoraMessage {
  id: string;
  sessionId: string;
  agentId?: string;
  userId?: string;
  content: string;
  tier: 0 | 1 | 2;
  createdAt: Date;
}

// Signal Types
export type SignalSource = 'rss' | 'social' | 'blockchain' | 'api' | 'manual';

export interface Signal {
  id: string;
  source: SignalSource;
  content: string;
  metadata: Record<string, unknown>;
  processed: boolean;
  createdAt: Date;
}

// Issue Types
export type IssueStatus = 'open' | 'discussing' | 'voting' | 'resolved' | 'rejected';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Issue {
  id: string;
  title: string;
  description: string;
  signalIds: string[];
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: Date;
  updatedAt: Date;
}

// Proposal Types
export type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed';

export interface Proposal {
  id: string;
  issueId: string;
  title: string;
  content: string;
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  createdAt: Date;
  closedAt?: Date;
}

// Budget Types
export interface BudgetState {
  dailyLimit: number;
  spent: number;
  remaining: number;
  tier2CallsToday: number;
  lastResetDate: string;
}

// Activity Types
export type ActivityType =
  | 'HEARTBEAT'
  | 'COLLECTOR'
  | 'AGENT_CHATTER'
  | 'AGENT_SUMMONED'
  | 'AGORA_SESSION_START'
  | 'DECISION_PACKET';

export interface Activity {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// Scheduler Types
export interface SchedulerState {
  nextTier2: Date | null;
  queueLength: number;
  isProcessing: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// WebSocket Event Types
export interface WsEventMap {
  'agent:stateChange': { agentId: string; state: AgentState };
  'agora:message': AgoraMessage;
  'agora:sessionStart': AgoraSession;
  'agora:sessionEnd': { sessionId: string };
  'activity:new': Activity;
  'signal:new': Signal;
  'budget:update': BudgetState;
}

// Health Check Types
export interface HealthStatus {
  status: 'running' | 'degraded' | 'maintenance';
  uptime: number;
  version: string;
  scheduler: SchedulerState;
  budget: BudgetState;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

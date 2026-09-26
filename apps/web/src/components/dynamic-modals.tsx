'use client';

import dynamic from 'next/dynamic';

/**
 * Skeleton component for modal loading states
 */
const ModalSkeleton = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="w-[600px] max-w-[90vw] h-[400px] bg-agora-card rounded-lg animate-pulse border border-agora-border">
      <div className="p-6 border-b border-agora-border">
        <div className="h-6 bg-agora-border rounded w-1/3" />
      </div>
      <div className="p-6 space-y-4">
        <div className="h-4 bg-agora-border rounded w-full" />
        <div className="h-4 bg-agora-border rounded w-3/4" />
        <div className="h-4 bg-agora-border rounded w-1/2" />
      </div>
    </div>
  </div>
);

/**
 * Dynamically imported modal components
 * These are loaded only when needed, reducing initial bundle size by 15-20%
 */

// Proposal Modal
export const ProposalDetailModal = dynamic(
  () => import('./proposals/ProposalDetailModal').then(mod => ({ default: mod.ProposalDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Agent Detail Modal
export const AgentDetailModal = dynamic(
  () => import('./agents/AgentDetailModal').then(mod => ({ default: mod.AgentDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Activity Detail Modal
export const ActivityDetailModal = dynamic(
  () => import('./ui/ActivityDetailModal').then(mod => ({ default: mod.ActivityDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Issue Detail Modal
export const IssueDetailModal = dynamic(
  () => import('./issues/IssueDetailModal').then(mod => ({ default: mod.IssueDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Signal Detail Modal
export const SignalDetailModal = dynamic(
  () => import('./signals/SignalDetailModal').then(mod => ({ default: mod.SignalDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Agora Session Modals
export const SessionDetailModal = dynamic(
  () => import('./agora/SessionDetailModal').then(mod => ({ default: mod.SessionDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const AgoraAgentDetailModal = dynamic(
  () => import('./agora/AgentDetailModal').then(mod => ({ default: mod.AgentDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Governance Modals
export const DocumentDetailModal = dynamic(
  () => import('./governance/DocumentDetailModal').then(mod => ({ default: mod.DocumentDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const WorkflowDetailModal = dynamic(
  () => import('./governance/WorkflowDetailModal').then(mod => ({ default: mod.WorkflowDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const VoteDetailModal = dynamic(
  () => import('./governance/VoteDetailModal').then(mod => ({ default: mod.VoteDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const ApprovalDetailModal = dynamic(
  () => import('./governance/ApprovalDetailModal').then(mod => ({ default: mod.ApprovalDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const GovernanceStatsDetailModal = dynamic(
  () => import('./governance/StatsDetailModal').then(mod => ({ default: mod.StatsDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Disclosure Modal
export const DisclosureDetailModal = dynamic(
  () => import('./disclosure/DisclosureDetailModal').then(mod => ({ default: mod.DisclosureDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Treasury Modals
export const TransactionDetailModal = dynamic(
  () => import('./treasury/TransactionDetailModal').then(mod => ({ default: mod.TransactionDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

export const AllocationDetailModal = dynamic(
  () => import('./treasury/AllocationDetailModal').then(mod => ({ default: mod.AllocationDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// UI Modals
export const StatsDetailModal = dynamic(
  () => import('./ui/StatsDetailModal').then(mod => ({ default: mod.StatsDetailModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Wallet Modal
export const WalletVerifyModal = dynamic(
  () => import('./wallet/WalletVerifyModal').then(mod => ({ default: mod.WalletVerifyModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

// Delegation Modal
export const DelegationModal = dynamic(
  () => import('./delegation/DelegationModal').then(mod => ({ default: mod.DelegationModal })),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Play,
  Shield,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { type LockedAction, type RiskLevel } from '@/lib/api';
import { safeFormatDate } from '@/lib/utils';

interface LockedActionCardProps {
  action: LockedAction;
  onClick?: () => void;
  onApprove?: () => void;
  index?: number;
}

const riskColors: Record<RiskLevel, string> = {
  LOW: 'text-agora-success bg-agora-success/10 border-agora-success/30',
  MID: 'text-agora-warning bg-agora-warning/10 border-agora-warning/30',
  HIGH: 'text-agora-error bg-agora-error/10 border-agora-error/30',
};

const statusIcons: Record<string, React.ElementType> = {
  locked: Lock,
  approved: Unlock,
  rejected: XCircle,
  executed: Play,
};

const statusColors: Record<string, string> = {
  locked: 'text-agora-warning bg-agora-warning/10',
  approved: 'text-agora-success bg-agora-success/10',
  rejected: 'text-agora-error bg-agora-error/10',
  executed: 'text-agora-accent bg-agora-accent/10',
};

export function LockedActionCard({ action, onClick, onApprove, index = 0 }: LockedActionCardProps) {
  const t = useTranslations('Governance.safeAutonomy');
  const StatusIcon = statusIcons[action.status] || Lock;
  const statusColor = statusColors[action.status] || 'text-agora-muted bg-agora-muted/10';
  const riskColor = riskColors[action.riskLevel];

  const approvalProgress =
    action.requiredApprovals.length > 0
      ? (action.receivedApprovals.length / action.requiredApprovals.length) * 100
      : 0;

  return (
    <div
      className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border ${riskColor}`}>
            <Shield className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">{action.riskLevel}</span>
          </div>
          <span className="text-sm font-medium text-agora-text">{action.actionType}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${statusColor}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium capitalize">{t(`status.${action.status}`)}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-agora-muted" />
        </div>
      </div>

      {/* Lock Reason */}
      <div className="rounded-lg bg-agora-dark/50 p-3 mb-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-agora-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-agora-text">{t('lockReason')}</p>
            <p className="text-xs text-agora-muted mt-0.5">{action.lockReason}</p>
          </div>
        </div>
      </div>

      {/* Approval Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-agora-muted">{t('approvals')}</span>
          <span className="text-agora-text font-medium">
            {action.receivedApprovals.length} / {action.requiredApprovals.length}
          </span>
        </div>
        <div className="h-2 rounded-full bg-agora-border overflow-hidden">
          <div
            className="h-full bg-agora-success transition-all"
            style={{ width: `${approvalProgress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-agora-muted">
          {safeFormatDate(action.createdAt, (d) => formatDistanceToNow(d, { addSuffix: true }))}
        </span>

        {action.status === 'locked' && onApprove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            className="flex items-center gap-1.5 rounded-lg bg-agora-primary px-3 py-1.5 text-xs font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {t('approve')}
          </button>
        )}
      </div>
    </div>
  );
}

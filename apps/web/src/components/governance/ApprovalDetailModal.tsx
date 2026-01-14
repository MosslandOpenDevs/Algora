'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Play,
  Shield,
  AlertTriangle,
  User,
  Calendar,
  Clock,
  FileText,
  History,
} from 'lucide-react';
import { type LockedAction, type RiskLevel } from '@/lib/api';

interface ApprovalDetailModalProps {
  action: LockedAction;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: () => void;
}

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  LOW: { bg: 'bg-agora-success/10', text: 'text-agora-success', border: 'border-agora-success/30' },
  MID: { bg: 'bg-agora-warning/10', text: 'text-agora-warning', border: 'border-agora-warning/30' },
  HIGH: { bg: 'bg-agora-error/10', text: 'text-agora-error', border: 'border-agora-error/30' },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  locked: { icon: Lock, color: 'text-agora-warning', bgColor: 'bg-agora-warning/10' },
  approved: { icon: Unlock, color: 'text-agora-success', bgColor: 'bg-agora-success/10' },
  rejected: { icon: XCircle, color: 'text-agora-error', bgColor: 'bg-agora-error/10' },
  executed: { icon: Play, color: 'text-agora-accent', bgColor: 'bg-agora-accent/10' },
};

export function ApprovalDetailModal({ action, isOpen, onClose, onApprove }: ApprovalDetailModalProps) {
  const t = useTranslations('Governance.safeAutonomy');
  const riskStyle = riskColors[action.riskLevel];
  const statusStyle = statusConfig[action.status] || statusConfig.locked;
  const StatusIcon = statusStyle.icon;

  const approvalProgress =
    action.requiredApprovals.length > 0
      ? (action.receivedApprovals.length / action.requiredApprovals.length) * 100
      : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-card shadow-2xl animate-slide-up">
        {/* Header with risk level indicator */}
        <div className={`border-b-4 ${
          action.riskLevel === 'HIGH' ? 'border-agora-error' :
          action.riskLevel === 'MID' ? 'border-agora-warning' :
          'border-agora-success'
        }`}>
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border ${riskStyle.bg} ${riskStyle.text} ${riskStyle.border}`}>
                    <Shield className="h-4 w-4" />
                    <span className="text-sm font-bold">{action.riskLevel} RISK</span>
                  </div>
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${statusStyle.bgColor} ${statusStyle.color}`}>
                    <StatusIcon className="h-4 w-4" />
                    <span className="text-sm font-medium capitalize">{t(`status.${action.status}`)}</span>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900">{action.actionType}</h2>
                <p className="text-sm text-agora-muted mt-1">
                  ID: {action.id}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 250px)' }}>
          {/* Lock Reason Alert */}
          <div className={`mb-6 rounded-xl p-4 ${riskStyle.bg} border ${riskStyle.border}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-6 w-6 ${riskStyle.text} shrink-0`} />
              <div>
                <h3 className={`font-semibold ${riskStyle.text}`}>{t('lockReason')}</h3>
                <p className="text-sm text-slate-900 mt-1">{action.lockReason}</p>
              </div>
            </div>
          </div>

          {/* Action Description */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('actionDescription')}</h3>
            <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
              <p className="text-sm text-agora-muted">{action.actionDescription || 'No description provided'}</p>
            </div>
          </div>

          {/* Approval Progress */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('approvalProgress')}</h3>
            <div className="rounded-xl border border-agora-border bg-agora-card p-4">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-agora-muted">{t('approvals')}</span>
                  <span className="font-medium text-slate-900">
                    {action.receivedApprovals.length} / {action.requiredApprovals.length}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-agora-border overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-agora-success to-agora-accent transition-all"
                    style={{ width: `${approvalProgress}%` }}
                  />
                </div>
              </div>

              {/* Required Approvers */}
              <div className="space-y-2">
                {action.requiredApprovals.map((approver, index) => {
                  const isApproved = action.receivedApprovals.includes(approver);
                  return (
                    <div
                      key={approver}
                      className={`flex items-center justify-between rounded-lg p-3 ${
                        isApproved ? 'bg-agora-success/10' : 'bg-agora-dark/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          isApproved ? 'bg-agora-success text-white' : 'bg-agora-border text-agora-muted'
                        }`}>
                          {isApproved ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <span className="text-sm font-medium">{index + 1}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{approver}</p>
                          <p className="text-xs text-agora-muted">
                            {isApproved ? t('approved') : t('pendingApproval')}
                          </p>
                        </div>
                      </div>
                      {isApproved && (
                        <span className="text-xs text-agora-success font-medium">
                          {t('verified')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg bg-agora-dark/50 p-4">
              <div className="flex items-center gap-2 text-agora-muted mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">{t('createdAt')}</span>
              </div>
              <p className="text-sm text-slate-900">
                {format(new Date(action.createdAt), 'PPP')}
              </p>
              <p className="text-xs text-agora-muted mt-0.5">
                {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
              </p>
            </div>

            {action.expiresAt && (
              <div className="rounded-lg bg-agora-dark/50 p-4">
                <div className="flex items-center gap-2 text-agora-muted mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-medium">{t('expiresAt')}</span>
                </div>
                <p className="text-sm text-slate-900">
                  {format(new Date(action.expiresAt), 'PPP')}
                </p>
                <p className="text-xs text-agora-warning mt-0.5">
                  {formatDistanceToNow(new Date(action.expiresAt), { addSuffix: true })}
                </p>
              </div>
            )}

            {action.proposalId && (
              <div className="rounded-lg bg-agora-dark/50 p-4">
                <div className="flex items-center gap-2 text-agora-muted mb-1">
                  <FileText className="h-4 w-4" />
                  <span className="text-xs font-medium">{t('proposalId')}</span>
                </div>
                <p className="text-sm font-mono text-slate-900 truncate">{action.proposalId}</p>
              </div>
            )}

            {action.votingId && (
              <div className="rounded-lg bg-agora-dark/50 p-4">
                <div className="flex items-center gap-2 text-agora-muted mb-1">
                  <History className="h-4 w-4" />
                  <span className="text-xs font-medium">{t('votingId')}</span>
                </div>
                <p className="text-sm font-mono text-slate-900 truncate">{action.votingId}</p>
              </div>
            )}
          </div>

          {/* What happens after approval */}
          <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('afterApproval')}</h3>
            <ul className="space-y-2 text-sm text-agora-muted">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-agora-success mt-0.5 shrink-0" />
                <span>{t('afterApproval1')}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-agora-success mt-0.5 shrink-0" />
                <span>{t('afterApproval2')}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-agora-success mt-0.5 shrink-0" />
                <span>{t('afterApproval3')}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-agora-border bg-agora-card p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            {t('close')}
          </button>
          {action.status === 'locked' && onApprove && (
            <button
              onClick={onApprove}
              className="flex items-center gap-2 rounded-lg bg-agora-primary px-6 py-2.5 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80 hover:scale-105"
            >
              <CheckCircle className="h-4 w-4" />
              {t('approveAction')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

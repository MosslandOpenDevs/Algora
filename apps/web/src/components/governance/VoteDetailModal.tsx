'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  Vote,
  Coins,
  Code2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Users,
  Calendar,
  Shield,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ExternalLink,
} from 'lucide-react';
import { type DualHouseVote } from '@/lib/api';

interface VoteDetailModalProps {
  vote: DualHouseVote;
  isOpen: boolean;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'text-agora-muted bg-agora-muted/10',
  voting: 'text-agora-primary bg-agora-primary/10',
  passed: 'text-agora-success bg-agora-success/10',
  rejected: 'text-agora-error bg-agora-error/10',
  reconciliation: 'text-agora-warning bg-agora-warning/10',
};

const statusIcons: Record<string, React.ElementType> = {
  pending: Clock,
  voting: Vote,
  passed: CheckCircle,
  rejected: XCircle,
  reconciliation: AlertTriangle,
};

function HouseDetailCard({
  name,
  icon: Icon,
  votesFor,
  votesAgainst,
  votesAbstain,
  quorumReached,
  quorumThreshold,
  passThreshold,
  passed,
  totalVoters,
}: {
  name: string;
  icon: React.ElementType;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumReached: boolean;
  quorumThreshold: number;
  passThreshold: number;
  passed?: boolean;
  totalVoters: number;
}) {
  const total = votesFor + votesAgainst + votesAbstain;
  const forPercent = total > 0 ? (votesFor / total) * 100 : 0;
  const againstPercent = total > 0 ? (votesAgainst / total) * 100 : 0;
  const abstainPercent = total > 0 ? (votesAbstain / total) * 100 : 0;
  const participationRate = totalVoters > 0 ? (total / totalVoters) * 100 : 0;

  return (
    <div className="flex-1 rounded-xl border border-agora-border bg-agora-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-dark">
            <Icon className="h-5 w-5 text-agora-muted" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">{name}</h4>
            <p className="text-xs text-agora-muted">{total} votes cast</p>
          </div>
        </div>
        {passed !== undefined && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
            passed ? 'bg-agora-success/10 text-agora-success' : 'bg-agora-error/10 text-agora-error'
          }`}>
            {passed ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span className="text-sm font-medium">{passed ? 'PASSED' : 'FAILED'}</span>
          </div>
        )}
      </div>

      {/* Vote Distribution */}
      <div className="mb-4">
        <div className="h-3 rounded-full bg-agora-border overflow-hidden flex">
          <div
            className="bg-agora-success transition-all"
            style={{ width: `${forPercent}%` }}
          />
          <div
            className="bg-agora-error transition-all"
            style={{ width: `${againstPercent}%` }}
          />
          <div
            className="bg-agora-muted/50 transition-all"
            style={{ width: `${abstainPercent}%` }}
          />
        </div>
      </div>

      {/* Vote Counts */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-agora-success/10 p-3 text-center">
          <ThumbsUp className="h-4 w-4 text-agora-success mx-auto mb-1" />
          <p className="text-lg font-bold text-agora-success">{votesFor.toLocaleString()}</p>
          <p className="text-xs text-agora-muted">For</p>
        </div>
        <div className="rounded-lg bg-agora-error/10 p-3 text-center">
          <ThumbsDown className="h-4 w-4 text-agora-error mx-auto mb-1" />
          <p className="text-lg font-bold text-agora-error">{votesAgainst.toLocaleString()}</p>
          <p className="text-xs text-agora-muted">Against</p>
        </div>
        <div className="rounded-lg bg-agora-muted/10 p-3 text-center">
          <Minus className="h-4 w-4 text-agora-muted mx-auto mb-1" />
          <p className="text-lg font-bold text-agora-muted">{votesAbstain.toLocaleString()}</p>
          <p className="text-xs text-agora-muted">Abstain</p>
        </div>
      </div>

      {/* Thresholds */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-agora-muted">Quorum ({quorumThreshold}%)</span>
          <span className={quorumReached ? 'text-agora-success' : 'text-agora-warning'}>
            {participationRate.toFixed(1)}%
            {quorumReached ? ' ✓' : ' (pending)'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-agora-muted">Pass Threshold ({passThreshold}%)</span>
          <span className={forPercent >= passThreshold ? 'text-agora-success' : 'text-agora-muted'}>
            {forPercent.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function VoteDetailModal({ vote, isOpen, onClose }: VoteDetailModalProps) {
  const t = useTranslations('Governance.voting');
  const StatusIcon = statusIcons[vote.status] || Clock;
  const statusColor = statusColors[vote.status] || 'text-agora-muted bg-agora-muted/10';

  if (!isOpen) return null;

  const bothPassed = vote.mossCoinHouse.passed && vote.openSourceHouse.passed;
  const bothFailed = vote.mossCoinHouse.passed === false && vote.openSourceHouse.passed === false;
  const needsReconciliation = vote.mossCoinHouse.passed !== vote.openSourceHouse.passed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-card shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 border-b border-agora-border bg-agora-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${statusColor}`}>
                  <StatusIcon className="h-4 w-4" />
                  <span className="text-sm font-medium capitalize">{t(`status.${vote.status}`)}</span>
                </div>
                {vote.riskLevel && (
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                    vote.riskLevel === 'HIGH' ? 'border-agora-error/30 text-agora-error bg-agora-error/10' :
                    vote.riskLevel === 'MID' ? 'border-agora-warning/30 text-agora-warning bg-agora-warning/10' :
                    'border-agora-success/30 text-agora-success bg-agora-success/10'
                  }`}>
                    <Shield className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold">{vote.riskLevel}</span>
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{vote.title}</h2>
              {vote.summary && (
                <p className="text-sm text-agora-muted mt-2">{vote.summary}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Timeline */}
          <div className="mt-4 flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-agora-muted" />
              <span className="text-agora-muted">Created:</span>
              <span className="text-slate-900">{format(new Date(vote.createdAt), 'PPP')}</span>
            </div>
            {vote.status === 'voting' && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-agora-warning" />
                <span className="text-agora-muted">Ends:</span>
                <span className="text-agora-warning font-medium">
                  {formatDistanceToNow(new Date(vote.expiresAt), { addSuffix: true })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 220px)' }}>
          {/* Final Result Banner */}
          {vote.status !== 'voting' && vote.status !== 'pending' && (
            <div className={`mb-6 rounded-xl p-4 ${
              bothPassed ? 'bg-agora-success/10 border border-agora-success/30' :
              bothFailed ? 'bg-agora-error/10 border border-agora-error/30' :
              'bg-agora-warning/10 border border-agora-warning/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {bothPassed ? (
                    <CheckCircle className="h-8 w-8 text-agora-success" />
                  ) : bothFailed ? (
                    <XCircle className="h-8 w-8 text-agora-error" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-agora-warning" />
                  )}
                  <div>
                    <h3 className={`font-bold ${
                      bothPassed ? 'text-agora-success' :
                      bothFailed ? 'text-agora-error' :
                      'text-agora-warning'
                    }`}>
                      {bothPassed ? t('finalResult.passed') :
                       bothFailed ? t('finalResult.rejected') :
                       t('finalResult.reconciliation')}
                    </h3>
                    <p className="text-sm text-agora-muted">
                      {bothPassed ? t('finalResult.passedDesc') :
                       bothFailed ? t('finalResult.rejectedDesc') :
                       t('finalResult.reconciliationDesc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dual House Cards */}
          <div className="flex gap-4 mb-6">
            <HouseDetailCard
              name={t('mossCoinHouse')}
              icon={Coins}
              votesFor={vote.mossCoinHouse.votesFor}
              votesAgainst={vote.mossCoinHouse.votesAgainst}
              votesAbstain={vote.mossCoinHouse.votesAbstain}
              quorumReached={vote.mossCoinHouse.quorumReached}
              quorumThreshold={vote.mossCoinHouse.quorumThreshold}
              passThreshold={vote.mossCoinHouse.passThreshold}
              passed={vote.mossCoinHouse.passed}
              totalVoters={vote.mossCoinHouse.totalVoters || 100}
            />
            <HouseDetailCard
              name={t('openSourceHouse')}
              icon={Code2}
              votesFor={vote.openSourceHouse.votesFor}
              votesAgainst={vote.openSourceHouse.votesAgainst}
              votesAbstain={vote.openSourceHouse.votesAbstain}
              quorumReached={vote.openSourceHouse.quorumReached}
              quorumThreshold={vote.openSourceHouse.quorumThreshold}
              passThreshold={vote.openSourceHouse.passThreshold}
              passed={vote.openSourceHouse.passed}
              totalVoters={vote.openSourceHouse.totalVoters || 100}
            />
          </div>

          {/* Voting Rules */}
          <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('votingRules')}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-agora-success mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">{t('rules.bothMustPass')}</p>
                  <p className="text-xs text-agora-muted">{t('rules.bothMustPassDesc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-agora-primary mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">{t('rules.quorumRequired')}</p>
                  <p className="text-xs text-agora-muted">{t('rules.quorumRequiredDesc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-agora-warning mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">{t('rules.reconciliation')}</p>
                  <p className="text-xs text-agora-muted">{t('rules.reconciliationDesc')}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-agora-accent mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">{t('rules.highRisk')}</p>
                  <p className="text-xs text-agora-muted">{t('rules.highRiskDesc')}</p>
                </div>
              </div>
            </div>
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
          {vote.status === 'voting' && (
            <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80">
              <Vote className="h-4 w-4" />
              {t('castVote')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

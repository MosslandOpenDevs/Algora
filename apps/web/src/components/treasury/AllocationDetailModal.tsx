'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BudgetAllocation } from './AllocationCard';
import { safeFormatDate } from '@/lib/utils';

interface AllocationDetailModalProps {
  allocation: BudgetAllocation | null;
  isOpen: boolean;
  onClose: () => void;
}

const statusSteps = ['pending', 'approved', 'disbursed'] as const;

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' },
  approved: { icon: CheckCircle, color: 'text-blue-500', bgColor: 'bg-blue-500/20' },
  disbursed: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/20' },
  cancelled: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/20' },
};

export function AllocationDetailModal({
  allocation,
  isOpen,
  onClose,
}: AllocationDetailModalProps) {
  const t = useTranslations('Treasury');
  const [mounted, setMounted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !allocation) return null;

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getCurrentStepIndex = () => {
    if (allocation.status === 'cancelled') return -1;
    return statusSteps.indexOf(allocation.status as typeof statusSteps[number]);
  };

  const currentStepIndex = getCurrentStepIndex();

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative max-h-[90vh] w-full max-w-lg flex flex-col rounded-xl border border-agora-border bg-agora-dark shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-agora-border p-4 sm:p-6 flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className={`flex h-10 sm:h-12 w-10 sm:w-12 items-center justify-center rounded-lg flex-shrink-0 ${statusConfig[allocation.status]?.bgColor}`}>
              <FileText className={`h-5 sm:h-6 w-5 sm:w-6 ${statusConfig[allocation.status]?.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-agora-text">{t('modals.allocationDetail')}</h2>
              <p className="text-sm text-agora-muted">{allocation.category}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-agora-text flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        {/* Status Timeline */}
        {allocation.status !== 'cancelled' && (
          <div className="mb-4 sm:mb-6 rounded-lg bg-agora-card p-4">
            <h3 className="mb-3 text-sm font-medium text-agora-text">{t('status')}</h3>
            <div className="flex items-center justify-between">
              {statusSteps.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const StepIcon = statusConfig[step].icon;

                return (
                  <div key={step} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          isCompleted
                            ? statusConfig[step].bgColor
                            : 'bg-agora-border'
                        }`}
                      >
                        <StepIcon
                          className={`h-4 w-4 ${
                            isCompleted ? statusConfig[step].color : 'text-agora-muted'
                          }`}
                        />
                      </div>
                      <span
                        className={`mt-1 text-xs ${
                          isCurrent ? 'font-medium text-agora-text' : 'text-agora-muted'
                        }`}
                      >
                        {t(`allocation.${step}`)}
                      </span>
                    </div>
                    {index < statusSteps.length - 1 && (
                      <ArrowRight
                        className={`mx-2 h-4 w-4 ${
                          index < currentStepIndex ? 'text-agora-accent' : 'text-agora-muted'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cancelled Status */}
        {allocation.status === 'cancelled' && (
          <div className="mb-4 sm:mb-6 rounded-lg bg-red-500/10 p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="font-medium text-red-400">{t('allocation.cancelled')}</span>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-4">
          {/* Amount */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="text-sm text-agora-muted">{t('amount')}</div>
            <div className="text-2xl font-bold text-agora-accent">
              {formatBalance(allocation.amount)} {allocation.tokenSymbol}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="mb-1 text-sm text-agora-muted">{t('description')}</div>
            <div className="text-agora-text">{allocation.description}</div>
          </div>

          {/* Recipient */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="mb-1 text-sm text-agora-muted">{t('recipient')}</div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-agora-text">
                {formatAddress(allocation.recipient)}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => copyToClipboard(allocation.recipient, 'recipient')}
                  className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                >
                  {copiedField === 'recipient' ? (
                    <Check className="h-4 w-4 text-agora-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={`https://etherscan.io/address/${allocation.recipient}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Transaction Hash (if disbursed) */}
          {allocation.txHash && (
            <div className="rounded-lg bg-agora-card p-4">
              <div className="mb-1 text-sm text-agora-muted">{t('txHash')}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-agora-text">
                  {allocation.txHash.slice(0, 10)}...{allocation.txHash.slice(-8)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyToClipboard(allocation.txHash!, 'txHash')}
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    {copiedField === 'txHash' ? (
                      <Check className="h-4 w-4 text-agora-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={`https://etherscan.io/tx/${allocation.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg bg-agora-card p-4">
              <div className="mb-1 text-sm text-agora-muted">{t('createdAt')}</div>
              <div className="text-sm text-agora-text">
                {safeFormatDate(allocation.createdAt, (d) => d.toLocaleString())}
              </div>
            </div>
            {allocation.approvedAt && (
              <div className="rounded-lg bg-agora-card p-4">
                <div className="mb-1 text-sm text-agora-muted">{t('approvedAt')}</div>
                <div className="text-sm text-agora-text">
                  {safeFormatDate(allocation.approvedAt, (d) => d.toLocaleString())}
                </div>
              </div>
            )}
            {allocation.disbursedAt && (
              <div className="rounded-lg bg-agora-card p-4">
                <div className="mb-1 text-sm text-agora-muted">{t('disbursedAt')}</div>
                <div className="text-sm text-agora-text">
                  {safeFormatDate(allocation.disbursedAt, (d) => d.toLocaleString())}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="border-t border-agora-border p-4 flex-shrink-0">
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-agora-text transition-colors hover:bg-agora-border"
        >
          {t('modals.close')}
        </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

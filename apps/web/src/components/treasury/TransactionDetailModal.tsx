'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  FileText,
  Copy,
  Check,
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TreasuryTransaction } from './TransactionCard';
import { safeFormatDate } from '@/lib/utils';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface TransactionDetailModalProps {
  transaction: TreasuryTransaction | null;
  isOpen: boolean;
  onClose: () => void;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  deposit: ArrowDownRight,
  withdrawal: ArrowUpRight,
  transfer: ArrowLeftRight,
  allocation: FileText,
};

const typeColors: Record<string, { bg: string; icon: string; text: string }> = {
  deposit: { bg: 'bg-green-500/20', icon: 'text-green-700 dark:text-green-400', text: 'text-green-700 dark:text-green-400' },
  withdrawal: { bg: 'bg-red-500/20', icon: 'text-red-700 dark:text-red-400', text: 'text-red-700 dark:text-red-400' },
  transfer: { bg: 'bg-blue-500/20', icon: 'text-blue-700 dark:text-blue-400', text: 'text-blue-700 dark:text-blue-400' },
  allocation: { bg: 'bg-purple-500/20', icon: 'text-purple-700 dark:text-purple-400', text: 'text-purple-700 dark:text-purple-400' },
};

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-700 dark:text-yellow-400', bgColor: 'bg-yellow-500/20' },
  confirmed: { icon: CheckCircle, color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-500/20' },
  failed: { icon: XCircle, color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-500/20' },
};

export function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
}: TransactionDetailModalProps) {
  const t = useTranslations('Treasury');
  const [mounted, setMounted] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { dialogProps, titleProps } = useDialogA11y({ isOpen, onClose });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !transaction) return null;

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

  const TypeIcon = typeIcons[transaction.type] || ArrowLeftRight;
  const colors = typeColors[transaction.type] || typeColors.transfer;
  const StatusIcon = statusConfig[transaction.status]?.icon || Clock;
  const isInflow = transaction.type === 'deposit';
  const sign = isInflow ? '+' : '-';

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        {...dialogProps}
        className="relative max-h-[90vh] w-full max-w-lg flex flex-col rounded-xl border border-agora-border bg-agora-dark shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-agora-border p-4 sm:p-6 flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className={`flex h-10 sm:h-12 w-10 sm:w-12 items-center justify-center rounded-lg flex-shrink-0 ${colors.bg}`}>
              <TypeIcon className={`h-5 sm:h-6 w-5 sm:w-6 ${colors.icon}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 {...titleProps} className="text-lg sm:text-xl font-bold text-agora-text">{t('modals.transactionDetail')}</h2>
              <p className="text-sm text-agora-muted">{t(`transaction.${transaction.type}`)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-agora-text flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        {/* Status Badge */}
        <div className={`mb-4 sm:mb-6 flex items-center gap-2 rounded-lg p-3 ${statusConfig[transaction.status]?.bgColor}`}>
          <StatusIcon className={`h-5 w-5 ${statusConfig[transaction.status]?.color}`} />
          <span className={`font-medium ${statusConfig[transaction.status]?.color}`}>
            {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-4">
          {/* Amount */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="text-sm text-agora-muted">{t('amount')}</div>
            <div className={`text-2xl font-bold ${colors.text}`}>
              {sign}
              {formatBalance(transaction.amount)} {transaction.tokenSymbol}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg bg-agora-card p-4">
            <div className="mb-1 text-sm text-agora-muted">{t('description')}</div>
            <div className="text-agora-text">{transaction.description}</div>
          </div>

          {/* From Address */}
          {transaction.fromAddress && (
            <div className="rounded-lg bg-agora-card p-4">
              <div className="mb-1 text-sm text-agora-muted">{t('from')}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-agora-text">
                  {formatAddress(transaction.fromAddress)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyToClipboard(transaction.fromAddress!, 'from')}
                    aria-label="Copy from address"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    {copiedField === 'from' ? (
                      <Check className="h-4 w-4 text-agora-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={`https://etherscan.io/address/${transaction.fromAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View from address on Etherscan"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* To Address */}
          {transaction.toAddress && (
            <div className="rounded-lg bg-agora-card p-4">
              <div className="mb-1 text-sm text-agora-muted">{t('to')}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-agora-text">
                  {formatAddress(transaction.toAddress)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyToClipboard(transaction.toAddress!, 'to')}
                    aria-label="Copy to address"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    {copiedField === 'to' ? (
                      <Check className="h-4 w-4 text-agora-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={`https://etherscan.io/address/${transaction.toAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View to address on Etherscan"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Transaction Hash */}
          {transaction.txHash && (
            <div className="rounded-lg bg-agora-card p-4">
              <div className="mb-1 text-sm text-agora-muted">{t('txHash')}</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-agora-text">
                  {transaction.txHash.slice(0, 10)}...{transaction.txHash.slice(-8)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => copyToClipboard(transaction.txHash!, 'txHash')}
                    aria-label="Copy transaction hash"
                    className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                  >
                    {copiedField === 'txHash' ? (
                      <Check className="h-4 w-4 text-agora-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={`https://etherscan.io/tx/${transaction.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View transaction on Etherscan"
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
                {safeFormatDate(transaction.createdAt, (d) => d.toLocaleString())}
              </div>
            </div>
            {transaction.confirmedAt && (
              <div className="rounded-lg bg-agora-card p-4">
                <div className="mb-1 text-sm text-agora-muted">{t('confirmedAt')}</div>
                <div className="text-sm text-agora-text">
                  {safeFormatDate(transaction.confirmedAt, (d) => d.toLocaleString())}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-agora-border p-4 flex-shrink-0">
        {/* View on Explorer Button */}
        {transaction.txHash && (
          <a
            href={`https://etherscan.io/tx/${transaction.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80"
          >
            <ExternalLink className="h-4 w-4" />
            {t('modals.viewOnExplorer')}
          </a>
        )}

        {/* Close Button */}
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

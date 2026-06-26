'use client';

import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { safeFormatDate } from '@/lib/utils';

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

interface TransactionCardProps {
  transaction: TreasuryTransaction;
  onClick?: () => void;
  index?: number;
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

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

export function TransactionCard({ transaction, onClick, index = 0 }: TransactionCardProps) {
  const t = useTranslations('Treasury');

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const Icon = typeIcons[transaction.type] || ArrowLeftRight;
  const colors = typeColors[transaction.type] || typeColors.transfer;

  const isInflow = transaction.type === 'deposit';
  const sign = isInflow ? '+' : '-';

  return (
    <div
      onClick={onClick}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-accent/50 hover:shadow-md ${onClick ? 'cursor-pointer' : ''} animate-slide-up`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${colors.bg}`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-agora-text">{t(`transaction.${transaction.type}`)}</p>
          <p className="text-sm text-agora-muted line-clamp-1 break-words">{transaction.description}</p>
          {transaction.txHash && (
            <p className="mt-1 font-mono text-xs text-agora-muted truncate">
              {transaction.txHash.slice(0, 10)}...{transaction.txHash.slice(-8)}
            </p>
          )}
        </div>
      </div>
      <div className="text-left sm:text-right flex-shrink-0">
        <p className={`font-semibold ${colors.text}`}>
          {sign}
          {formatBalance(transaction.amount)} {transaction.tokenSymbol}
        </p>
        <span
          className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColors[transaction.status]}`}
        >
          {transaction.status}
        </span>
        <p className="mt-1 text-xs text-agora-muted">
          {safeFormatDate(transaction.createdAt, (d) => d.toLocaleDateString())}
        </p>
      </div>
    </div>
  );
}

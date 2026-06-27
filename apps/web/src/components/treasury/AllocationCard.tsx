'use client';

import { FileText, Briefcase, Code, Megaphone, Shield, Cog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { safeFormatDate } from '@/lib/utils';
import { MockDataBadge } from '@/components/ui/MockDataBadge';

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

interface AllocationCardProps {
  allocation: BudgetAllocation;
  onClick?: () => void;
  index?: number;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  operations: Cog,
  development: Code,
  marketing: Megaphone,
  security: Shield,
  business: Briefcase,
  default: FileText,
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  approved: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  disbursed: 'bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

export function AllocationCard({ allocation, onClick, index = 0 }: AllocationCardProps) {
  const t = useTranslations('Treasury');

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const Icon = categoryIcons[allocation.category.toLowerCase()] || categoryIcons.default;

  return (
    <div
      onClick={onClick}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-accent/50 hover:shadow-md ${onClick ? 'cursor-pointer' : ''} animate-slide-up`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20 flex-shrink-0">
          <Icon className="h-5 w-5 text-agora-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-agora-text">{allocation.category}</p>
          <p className="text-sm text-agora-muted line-clamp-1 break-words">{allocation.description}</p>
          <p className="mt-1 font-mono text-xs text-agora-muted truncate">
            {t('recipient')}: {formatAddress(allocation.recipient)}
          </p>
        </div>
      </div>
      <div className="text-left sm:text-right flex-shrink-0">
        <div className="flex items-center gap-2 sm:justify-end">
          <MockDataBadge />
          <p className="font-semibold text-agora-text">
            {formatBalance(allocation.amount)} {allocation.tokenSymbol}
          </p>
        </div>
        <span
          className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${statusColors[allocation.status]}`}
        >
          {t(`allocation.${allocation.status}`)}
        </span>
        <p className="mt-1 text-xs text-agora-muted">
          {safeFormatDate(allocation.createdAt, (d) => d.toLocaleDateString())}
        </p>
      </div>
    </div>
  );
}

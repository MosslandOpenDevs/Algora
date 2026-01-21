'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PassiveConsensusStatus {
  id: string;
  documentId: string;
  documentType: string;
  riskLevel: 'LOW' | 'MID' | 'HIGH';
  status: 'PENDING' | 'APPROVED_BY_TIMEOUT' | 'EXPLICITLY_APPROVED' | 'VETOED' | 'ESCALATED';
  reviewPeriodEndsAt: string;
  unreviewedByHuman: boolean;
  timeRemainingMs: number;
  timeRemainingHours: number;
}

interface PassiveConsensusIndicatorProps {
  documentId: string;
  className?: string;
  compact?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export function PassiveConsensusIndicator({
  documentId,
  className,
  compact = false,
}: PassiveConsensusIndicatorProps) {
  const t = useTranslations('PassiveConsensus');

  const { data: status, isLoading, error } = useQuery<PassiveConsensusStatus>({
    queryKey: ['passive-consensus', documentId],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/passive-consensus/${documentId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch status');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  if (isLoading || error || !status) return null;

  const getStatusConfig = () => {
    switch (status.status) {
      case 'PENDING':
        return {
          icon: Clock,
          label: t('status.pending'),
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
        };
      case 'APPROVED_BY_TIMEOUT':
        return {
          icon: CheckCircle,
          label: t('status.autoApproved'),
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
        };
      case 'EXPLICITLY_APPROVED':
        return {
          icon: CheckCircle,
          label: t('status.approved'),
          color: 'text-green-600 dark:text-green-400',
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
        };
      case 'VETOED':
        return {
          icon: XCircle,
          label: t('status.vetoed'),
          color: 'text-red-600 dark:text-red-400',
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
        };
      case 'ESCALATED':
        return {
          icon: AlertTriangle,
          label: t('status.escalated'),
          color: 'text-orange-600 dark:text-orange-400',
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
        };
      default:
        return {
          icon: Eye,
          label: t('status.unknown'),
          color: 'text-gray-600 dark:text-gray-400',
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
        };
    }
  };

  const getRiskLevelConfig = () => {
    switch (status.riskLevel) {
      case 'LOW':
        return {
          label: t('risk.low'),
          color: 'text-green-600 dark:text-green-400',
          hours: 24,
        };
      case 'MID':
        return {
          label: t('risk.mid'),
          color: 'text-amber-600 dark:text-amber-400',
          hours: 48,
        };
      case 'HIGH':
        return {
          label: t('risk.high'),
          color: 'text-red-600 dark:text-red-400',
          hours: 72,
        };
    }
  };

  const statusConfig = getStatusConfig();
  const riskConfig = getRiskLevelConfig();
  const StatusIcon = statusConfig.icon;

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
          statusConfig.bg,
          statusConfig.border,
          'border',
          className
        )}
        title={`${statusConfig.label} - ${riskConfig.label} Risk`}
      >
        <StatusIcon className={cn('h-3 w-3', statusConfig.color)} />
        <span className={statusConfig.color}>
          {status.status === 'PENDING'
            ? `${status.timeRemainingHours.toFixed(1)}h`
            : statusConfig.label}
        </span>
        {status.unreviewedByHuman && (
          <ShieldAlert className="h-3 w-3 text-amber-500" title={t('unreviewedByHuman')} />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        statusConfig.bg,
        statusConfig.border,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-5 w-5', statusConfig.color)} />
          <div>
            <p className={cn('text-sm font-medium', statusConfig.color)}>
              {statusConfig.label}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('riskLevel')}: <span className={riskConfig.color}>{riskConfig.label}</span>
            </p>
          </div>
        </div>

        {status.status === 'PENDING' && (
          <div className="text-right">
            <p className={cn('text-lg font-semibold', statusConfig.color)}>
              {status.timeRemainingHours.toFixed(1)}h
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('remaining')}
            </p>
          </div>
        )}
      </div>

      {status.unreviewedByHuman && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-3 w-3" />
          <span>{t('unreviewedByHuman')}</span>
        </div>
      )}

      {status.status === 'PENDING' && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('autoApproveNote', { hours: riskConfig.hours })}
        </p>
      )}
    </div>
  );
}

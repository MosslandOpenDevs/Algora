'use client';

import { Vote, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface DelegationStatsProps {
  ownVotingPower: number;
  delegatedIn: number;
  delegatedOut: number;
  effectiveVotingPower: number;
}

export function DelegationStats({
  ownVotingPower,
  delegatedIn,
  delegatedOut,
  effectiveVotingPower,
}: DelegationStatsProps) {
  const t = useTranslations('Delegation');

  const stats = [
    {
      label: t('stats.ownPower'),
      value: ownVotingPower,
      icon: Vote,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      prefix: '',
    },
    {
      label: t('stats.delegatedIn'),
      value: delegatedIn,
      icon: ArrowDownRight,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      prefix: '+',
    },
    {
      label: t('stats.delegatedOut'),
      value: delegatedOut,
      icon: ArrowUpRight,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
      prefix: '-',
    },
    {
      label: t('stats.effectivePower'),
      value: effectiveVotingPower,
      icon: Zap,
      color: 'text-agora-accent',
      bgColor: 'bg-agora-accent/20',
      prefix: '',
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-xl border p-6 transition-all ${
            stat.highlight
              ? 'border-agora-accent/50 bg-agora-accent/10'
              : 'border-agora-border bg-agora-card'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-agora-muted">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.highlight ? 'text-agora-accent' : 'text-slate-900'}`}>
                {stat.prefix}{stat.value.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

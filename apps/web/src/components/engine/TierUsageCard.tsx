'use client';

import { useTranslations } from 'next-intl';
import { Layers, Zap, Cpu, Cloud } from 'lucide-react';

interface TierUsageCardProps {
  usage: {
    tier0: { calls: number; label: string };
    tier1: { calls: number; label: string };
    tier2: { calls: number; label: string };
  };
}

export function TierUsageCard({ usage }: TierUsageCardProps) {
  const t = useTranslations('Engine.tiers');

  const total = usage.tier0.calls + usage.tier1.calls + usage.tier2.calls;

  const tiers = [
    {
      key: 'tier0',
      icon: Zap,
      color: 'text-gray-400',
      bg: 'bg-gray-500',
      calls: usage.tier0.calls,
      label: t('tier0'),
      desc: t('tier0Desc'),
    },
    {
      key: 'tier1',
      icon: Cpu,
      color: 'text-agora-primary',
      bg: 'bg-agora-primary',
      calls: usage.tier1.calls,
      label: t('tier1'),
      desc: t('tier1Desc'),
    },
    {
      key: 'tier2',
      icon: Cloud,
      color: 'text-agora-accent',
      bg: 'bg-agora-accent',
      calls: usage.tier2.calls,
      label: t('tier2'),
      desc: t('tier2Desc'),
    },
  ];

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-5">
      <div className="flex items-center gap-2 text-slate-900">
        <Layers className="h-5 w-5 text-agora-primary" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      {/* Distribution Bar */}
      <div className="mt-4 h-3 rounded-full bg-agora-darker overflow-hidden flex">
        {tiers.map((tier) => (
          <div
            key={tier.key}
            className={`${tier.bg} transition-all`}
            style={{ width: `${total > 0 ? (tier.calls / total) * 100 : 0}%` }}
          />
        ))}
      </div>

      {/* Tier Details */}
      <div className="mt-4 space-y-3">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const percent = total > 0 ? ((tier.calls / total) * 100).toFixed(1) : '0';

          return (
            <div key={tier.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${tier.bg}/10`}>
                  <Icon className={`h-4 w-4 ${tier.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{tier.label}</p>
                  <p className="text-xs text-agora-muted">{tier.desc}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {tier.calls.toLocaleString()}
                </p>
                <p className="text-xs text-agora-muted">{percent}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

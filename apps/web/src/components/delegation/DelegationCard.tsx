'use client';

import { Users, X, Clock, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Delegation } from '@/lib/api';

export interface DelegationCardProps {
  delegation: Delegation;
  type: 'given' | 'received';
  onRevoke?: () => void;
  index?: number;
}

export function DelegationCard({ delegation, type, onRevoke, index = 0 }: DelegationCardProps) {
  const t = useTranslations('Delegation');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatExpiration = (expiresAt?: string) => {
    if (!expiresAt) return t('noExpiration');
    const date = new Date(expiresAt);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return t('expired');
    if (days === 1) return t('expiresInDay', { days: 1 });
    return t('expiresInDays', { days });
  };

  const targetAddress = type === 'given' ? delegation.delegate : delegation.delegator;

  return (
    <div
      className="rounded-xl border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-accent/30"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
            <Users className="h-5 w-5 text-agora-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-agora-muted">
                {type === 'given' ? t('delegatedTo') : t('delegatedFrom')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-900">
                {formatAddress(targetAddress)}
              </span>
              <button
                onClick={() => copyToClipboard(targetAddress, 'address')}
                className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
              >
                {copiedField === 'address' ? (
                  <Check className="h-3 w-3 text-agora-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <a
                href={`https://etherscan.io/address/${targetAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-lg font-bold text-agora-accent">
              {delegation.weight.toLocaleString()} VP
            </div>
            <div className="flex items-center justify-end gap-1 text-xs text-agora-muted">
              <Clock className="h-3 w-3" />
              {formatExpiration(delegation.expires_at)}
            </div>
          </div>

          {type === 'given' && onRevoke && (
            <button
              onClick={onRevoke}
              className="flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
            >
              <X className="h-3 w-3" />
              {t('revoke')}
            </button>
          )}
        </div>
      </div>

      {delegation.categories && delegation.categories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-agora-border pt-3">
          {delegation.categories.map((category) => (
            <span
              key={category}
              className="rounded-full bg-agora-border px-2 py-0.5 text-xs text-agora-muted"
            >
              {category}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DelegationCard } from './DelegationCard';
import type { DelegationResponse } from '@/lib/api';

type TabKey = 'given' | 'received';

interface DelegationListProps {
  delegations: DelegationResponse;
  onRevoke: (id: string) => void;
  isLoading?: boolean;
  isRevoking?: boolean;
}

export function DelegationList({
  delegations,
  onRevoke,
  isLoading = false,
  isRevoking = false,
}: DelegationListProps) {
  const t = useTranslations('Delegation');
  const [activeTab, setActiveTab] = useState<TabKey>('given');

  const givenDelegations = delegations.delegatedTo || [];
  const receivedDelegations = delegations.delegatedFrom || [];

  const currentList = activeTab === 'given' ? givenDelegations : receivedDelegations;

  return (
    <div className="rounded-xl border border-agora-border bg-agora-card">
      {/* Tabs */}
      <div className="border-b border-agora-border p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('given')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'given'
                ? 'bg-agora-accent text-white'
                : 'text-agora-muted hover:bg-agora-border hover:text-slate-900'
            }`}
          >
            {t('tabs.given')}
            {givenDelegations.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activeTab === 'given' ? 'bg-white/20' : 'bg-agora-border'
                }`}
              >
                {givenDelegations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'received'
                ? 'bg-agora-accent text-white'
                : 'text-agora-muted hover:bg-agora-border hover:text-slate-900'
            }`}
          >
            {t('tabs.received')}
            {receivedDelegations.length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activeTab === 'received' ? 'bg-white/20' : 'bg-agora-border'
                }`}
              >
                {receivedDelegations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-agora-muted" />
            <p className="mt-4 text-agora-muted">{t('loading')}</p>
          </div>
        ) : currentList.length > 0 ? (
          <div className="space-y-3">
            {currentList.map((delegation, index) => (
              <div key={delegation.id} className="relative">
                <DelegationCard
                  delegation={delegation}
                  type={activeTab}
                  onRevoke={activeTab === 'given' ? () => onRevoke(delegation.id) : undefined}
                  index={index}
                />
                {isRevoking && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-agora-dark/50">
                    <Loader2 className="h-6 w-6 animate-spin text-agora-accent" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-agora-muted" />
            <p className="mt-4 text-agora-muted">
              {activeTab === 'given' ? t('noDelegationsGiven') : t('noDelegationsReceived')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

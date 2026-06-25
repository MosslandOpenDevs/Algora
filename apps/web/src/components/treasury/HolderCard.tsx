'use client';

import { Users, ShieldCheck, Vote, ExternalLink, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface TokenHolder {
  id: string;
  walletAddress: string;
  userId?: string;
  balance: string;
  votingPower: number;
  verifiedAt?: string;
  lastBalanceCheck?: string;
  isVerified: boolean;
}

interface HolderCardProps {
  holder: TokenHolder;
  onClick?: () => void;
  index?: number;
}

export function HolderCard({ holder, onClick, index = 0 }: HolderCardProps) {
  const t = useTranslations('Treasury');
  const [copied, setCopied] = useState(false);

  const formatBalance = (balance: string, decimals: number = 18) => {
    const value = BigInt(balance) / BigInt(10 ** decimals);
    return value.toLocaleString();
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(holder.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-accent/50 hover:shadow-md ${onClick ? 'cursor-pointer' : ''} animate-slide-up`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-agora-accent/20">
          <Users className="h-5 w-5 text-agora-accent" />
          {holder.isVerified && (
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-agora-success">
              <ShieldCheck className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-medium text-agora-text">
              {formatAddress(holder.walletAddress)}
            </p>
            <button
              onClick={copyAddress}
              className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
              title={t('copy')}
            >
              {copied ? (
                <Check className="h-3 w-3 text-agora-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            <a
              href={`https://etherscan.io/address/${holder.walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
              title={t('viewOnEtherscan')}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {holder.verifiedAt && (
            <p className="text-sm text-agora-muted">
              {t('verifiedAt')}: {new Date(holder.verifiedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Vote className="h-4 w-4 text-agora-accent" />
          <p className="font-semibold text-agora-text">
            {holder.votingPower.toLocaleString()} {t('votingPower')}
          </p>
        </div>
        <p className="mt-1 text-sm text-agora-muted">{formatBalance(holder.balance)} MOC</p>
      </div>
    </div>
  );
}

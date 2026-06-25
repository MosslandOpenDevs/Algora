'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import {
  Wallet,
  ChevronDown,
  LogOut,
  Copy,
  ExternalLink,
  Check,
  ShieldCheck,
  ShieldAlert,
  Vote,
  Coins,
  RefreshCw,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWalletContext } from '@/contexts/WalletContext';
import { WalletVerifyModal } from './WalletVerifyModal';

export function WalletConnect() {
  const t = useTranslations('Wallet');
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const { address, isConnected, connector } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  const { holder, isVerified, isLoading, refreshHolder } = useWalletContext();

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (balanceStr: string, decimals = 18) => {
    const num = Number(balanceStr) / 10 ** decimals;
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  };

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isConnected && address) {
    return (
      <>
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 rounded-lg bg-agora-card px-3 py-2 text-sm font-medium text-agora-text transition-colors hover:bg-agora-border"
          >
            <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-agora-accent/20">
              <Wallet className="h-3.5 w-3.5 text-agora-accent" />
              {isVerified && (
                <div className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-agora-success">
                  <Check className="h-2 w-2 text-white" />
                </div>
              )}
            </div>
            <span>{formatAddress(address)}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-agora-border bg-agora-dark p-4 shadow-xl">
                {/* Connected With */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="mb-1 text-xs text-agora-muted">{t('connectedWith')}</div>
                    <div className="text-sm font-medium text-agora-text">
                      {connector?.name || 'Unknown'}
                    </div>
                  </div>
                  {/* Verification Badge */}
                  {isVerified ? (
                    <div className="flex items-center gap-1 rounded-full bg-agora-success/20 px-2 py-1 text-xs font-medium text-agora-success">
                      <ShieldCheck className="h-3 w-3" />
                      {t('verified')}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 rounded-full bg-agora-warning/20 px-2 py-1 text-xs font-medium text-agora-warning">
                      <ShieldAlert className="h-3 w-3" />
                      {t('notVerified')}
                    </div>
                  )}
                </div>

                {/* Address */}
                <div className="mb-4 rounded-lg bg-agora-card p-3">
                  <div className="mb-1 text-xs text-agora-muted">{t('address')}</div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-agora-text">
                      {formatAddress(address)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={copyAddress}
                        className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                        title={t('copy')}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-agora-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <a
                        href={`https://etherscan.io/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text"
                        title={t('viewOnEtherscan')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Balances Grid */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {/* ETH Balance */}
                  {balance && (
                    <div className="rounded-lg bg-agora-card p-3">
                      <div className="mb-1 text-xs text-agora-muted">{t('balance')}</div>
                      <div className="text-sm font-semibold text-agora-text">
                        {(Number(balance.value) / 10 ** balance.decimals).toFixed(4)}{' '}
                        {balance.symbol}
                      </div>
                    </div>
                  )}

                  {/* MOC Balance */}
                  <div className="rounded-lg bg-agora-card p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs text-agora-muted">
                      <Coins className="h-3 w-3" />
                      {t('mocBalance')}
                    </div>
                    <div className="text-sm font-semibold text-agora-text">
                      {holder ? formatBalance(holder.balance) : '0'} MOC
                    </div>
                  </div>
                </div>

                {/* Voting Power */}
                <div className="mb-4 rounded-lg bg-agora-accent/10 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs text-agora-muted">
                    <Vote className="h-3 w-3" />
                    {t('votingPower')}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold text-agora-accent">
                      {holder?.votingPower?.toLocaleString() || 0}
                    </div>
                    <button
                      onClick={refreshHolder}
                      disabled={isLoading}
                      className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-agora-text disabled:cursor-not-allowed disabled:opacity-50"
                      title={t('refresh')}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Verify Button (if not verified) */}
                {!isVerified && (
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowVerifyModal(true);
                    }}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {t('verifyWallet')}
                  </button>
                )}

                {/* Disconnect Button */}
                <button
                  onClick={() => {
                    disconnect();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
                >
                  <LogOut className="h-4 w-4" />
                  {t('disconnect')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Verification Modal */}
        <WalletVerifyModal isOpen={showVerifyModal} onClose={() => setShowVerifyModal(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Wallet className="h-4 w-4" />
        {isPending ? t('connecting') : t('connectWallet')}
      </button>

      {isOpen && !isConnected && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-agora-border bg-agora-dark p-4 shadow-xl">
            <div className="mb-3 text-sm font-medium text-agora-text">{t('selectWallet')}</div>
            <div className="space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setIsOpen(false);
                  }}
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded-lg bg-agora-card px-4 py-3 text-left text-sm font-medium text-agora-text transition-colors hover:bg-agora-border disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-agora-accent/20">
                    <Wallet className="h-4 w-4 text-agora-accent" />
                  </div>
                  <span>{connector.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

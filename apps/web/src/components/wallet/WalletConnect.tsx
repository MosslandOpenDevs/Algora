'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function WalletConnect() {
  const t = useTranslations('Wallet');
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { address, isConnected, connector } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
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
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-lg bg-agora-card px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-border"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-agora-accent/20">
            <Wallet className="h-3.5 w-3.5 text-agora-accent" />
          </div>
          <span>{formatAddress(address)}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-agora-border bg-agora-dark p-4 shadow-xl">
              <div className="mb-4">
                <div className="mb-1 text-xs text-agora-muted">{t('connectedWith')}</div>
                <div className="text-sm font-medium text-white">{connector?.name || 'Unknown'}</div>
              </div>

              <div className="mb-4 rounded-lg bg-agora-card p-3">
                <div className="mb-1 text-xs text-agora-muted">{t('address')}</div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">{formatAddress(address)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={copyAddress}
                      className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-white"
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
                      className="rounded p-1 text-agora-muted transition-colors hover:bg-agora-border hover:text-white"
                      title={t('viewOnEtherscan')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>

              {balance && (
                <div className="mb-4 rounded-lg bg-agora-card p-3">
                  <div className="mb-1 text-xs text-agora-muted">{t('balance')}</div>
                  <div className="text-lg font-semibold text-white">
                    {(Number(balance.value) / 10 ** balance.decimals).toFixed(4)} {balance.symbol}
                  </div>
                </div>
              )}

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
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-agora-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Wallet className="h-4 w-4" />
        {isPending ? t('connecting') : t('connectWallet')}
      </button>

      {isOpen && !isConnected && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-agora-border bg-agora-dark p-4 shadow-xl">
            <div className="mb-3 text-sm font-medium text-white">{t('selectWallet')}</div>
            <div className="space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setIsOpen(false);
                  }}
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded-lg bg-agora-card px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-agora-border disabled:cursor-not-allowed disabled:opacity-50"
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

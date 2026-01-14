'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Users,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createDelegation } from '@/lib/api';

type Step = 'intro' | 'input' | 'confirm' | 'success' | 'error';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  votingPower: number;
}

const CATEGORIES = ['treasury', 'technical', 'governance', 'community'];
const EXPIRATION_OPTIONS = [
  { label: 'never', value: null },
  { label: '30days', value: 30 },
  { label: '90days', value: 90 },
  { label: '180days', value: 180 },
];

export function DelegationModal({
  isOpen,
  onClose,
  walletAddress,
  votingPower,
}: DelegationModalProps) {
  const t = useTranslations('Delegation');
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('intro');
  const [delegateAddress, setDelegateAddress] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expiration, setExpiration] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const delegationMutation = useMutation({
    mutationFn: () => {
      const expiresAt = expiration
        ? new Date(Date.now() + expiration * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      return createDelegation({
        delegator: walletAddress,
        delegate: delegateAddress,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        expiresAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegations', walletAddress] });
      setStep('success');
    },
    onError: (error: Error) => {
      setErrorMessage(error.message);
      setStep('error');
    },
  });

  const handleClose = () => {
    setStep('intro');
    setDelegateAddress('');
    setSelectedCategories([]);
    setExpiration(null);
    setErrorMessage('');
    onClose();
  };

  const handleContinue = () => {
    if (step === 'intro') {
      setStep('input');
    } else if (step === 'input') {
      setStep('confirm');
    } else if (step === 'confirm') {
      delegationMutation.mutate();
    }
  };

  const handleBack = () => {
    if (step === 'input') {
      setStep('intro');
    } else if (step === 'confirm') {
      setStep('input');
    }
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const isValidAddress = (addr: string) => {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const canProceed = () => {
    if (step === 'input') {
      return isValidAddress(delegateAddress) && delegateAddress.toLowerCase() !== walletAddress.toLowerCase();
    }
    return true;
  };

  if (!isOpen || !mounted) return null;

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-agora-border bg-agora-dark p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Intro Step */}
        {step === 'intro' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-agora-accent/20">
              <Users className="h-8 w-8 text-agora-accent" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">{t('modal.title')}</h2>
            <p className="mb-6 text-agora-muted">{t('modal.intro')}</p>

            <div className="mb-6 rounded-lg bg-agora-card p-4">
              <div className="text-sm text-agora-muted">{t('stats.ownPower')}</div>
              <div className="text-2xl font-bold text-agora-accent">
                {votingPower.toLocaleString()} VP
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="w-full rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-agora-accent/90"
            >
              {t('modal.continue')}
            </button>
          </div>
        )}

        {/* Input Step */}
        {step === 'input' && (
          <div>
            <h2 className="mb-6 text-xl font-bold text-slate-900">{t('modal.inputTitle')}</h2>

            {/* Delegate Address */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-900">
                {t('delegateAddress')}
              </label>
              <input
                type="text"
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
                placeholder={t('enterAddress')}
                className="w-full rounded-lg border border-agora-border bg-agora-card px-4 py-3 text-sm text-slate-900 placeholder-agora-muted focus:border-agora-accent focus:outline-none"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <p className="mt-1 text-xs text-red-400">{t('invalidAddress')}</p>
              )}
              {delegateAddress.toLowerCase() === walletAddress.toLowerCase() && (
                <p className="mt-1 text-xs text-red-400">{t('cannotDelegateToSelf')}</p>
              )}
            </div>

            {/* Categories */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-900">
                {t('categories')} <span className="text-agora-muted">({t('optional')})</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedCategories.includes(category)
                        ? 'bg-agora-accent text-white'
                        : 'bg-agora-card text-agora-muted hover:bg-agora-border'
                    }`}
                  >
                    {t(`category.${category}`)}
                  </button>
                ))}
              </div>
              {selectedCategories.length === 0 && (
                <p className="mt-2 text-xs text-agora-muted">{t('allCategoriesHint')}</p>
              )}
            </div>

            {/* Expiration */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-900">
                {t('expiresAt')} <span className="text-agora-muted">({t('optional')})</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {EXPIRATION_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => setExpiration(option.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      expiration === option.value
                        ? 'bg-agora-accent text-white'
                        : 'bg-agora-card text-agora-muted hover:bg-agora-border'
                    }`}
                  >
                    {t(`expiration.${option.label}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('modal.back')}
              </button>
              <button
                onClick={handleContinue}
                disabled={!canProceed()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-agora-accent/90 disabled:opacity-50"
              >
                {t('delegate')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Confirm Step */}
        {step === 'confirm' && (
          <div>
            <h2 className="mb-6 text-xl font-bold text-slate-900">{t('confirmDelegation')}</h2>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg bg-agora-card p-4">
                <div className="text-sm text-agora-muted">{t('delegateTo')}</div>
                <div className="font-mono text-slate-900">{formatAddress(delegateAddress)}</div>
              </div>

              <div className="rounded-lg bg-agora-card p-4">
                <div className="text-sm text-agora-muted">{t('votingPower')}</div>
                <div className="text-xl font-bold text-agora-accent">
                  {votingPower.toLocaleString()} VP
                </div>
              </div>

              {selectedCategories.length > 0 && (
                <div className="rounded-lg bg-agora-card p-4">
                  <div className="mb-2 text-sm text-agora-muted">{t('categories')}</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-agora-border px-2 py-0.5 text-xs text-slate-900"
                      >
                        {t(`category.${cat}`)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-agora-card p-4">
                <div className="text-sm text-agora-muted">{t('expiresAt')}</div>
                <div className="text-slate-900">
                  {expiration
                    ? t(`expiration.${EXPIRATION_OPTIONS.find((o) => o.value === expiration)?.label}`)
                    : t('noExpiration')}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                disabled={delegationMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('modal.back')}
              </button>
              <button
                onClick={handleContinue}
                disabled={delegationMutation.isPending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-agora-accent/90 disabled:opacity-50"
              >
                {delegationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('modal.processing')}
                  </>
                ) : (
                  <>
                    {t('confirmDelegation')}
                    <CheckCircle className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">{t('delegationSuccess')}</h2>
            <p className="mb-6 text-agora-muted">
              {t('delegationSuccessDesc', {
                power: votingPower.toLocaleString(),
                address: formatAddress(delegateAddress),
              })}
            </p>
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
            >
              {t('modal.done')}
            </button>
          </div>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-900">{t('delegationFailed')}</h2>
            <p className="mb-6 text-agora-muted">{errorMessage || t('delegationFailedDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
              >
                {t('modal.tryAgain')}
              </button>
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-agora-accent/90"
              >
                {t('modal.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

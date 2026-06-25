'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSignMessage } from 'wagmi';
import { X, ShieldCheck, Loader2, CheckCircle, XCircle, FileSignature } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWalletContext } from '@/contexts/WalletContext';

interface WalletVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type VerificationStep = 'intro' | 'signing' | 'verifying' | 'success' | 'error';

export function WalletVerifyModal({ isOpen, onClose }: WalletVerifyModalProps) {
  const t = useTranslations('Wallet');
  const [step, setStep] = useState<VerificationStep>('intro');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const { startVerification, completeVerification, isVerifying, error } = useWalletContext();

  const { signMessage } = useSignMessage({
    mutation: {
      onSuccess: async (signature) => {
        setStep('verifying');
        try {
          await completeVerification(signature);
          setStep('success');
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'Verification failed');
          setStep('error');
        }
      },
      onError: (err) => {
        setErrorMessage(err.message || 'Signature rejected');
        setStep('error');
      },
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('intro');
      setErrorMessage('');
    }
  }, [isOpen]);

  // Update error message from context
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      setStep('error');
    }
  }, [error]);

  const handleStartVerification = async () => {
    try {
      const message = await startVerification();
      setStep('signing');
      signMessage({ message });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start verification');
      setStep('error');
    }
  };

  const handleClose = () => {
    if (step !== 'signing' && step !== 'verifying') {
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl border border-agora-border bg-agora-dark p-6 shadow-2xl">
        {/* Close Button */}
        {step !== 'signing' && step !== 'verifying' && (
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-lg p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-agora-text"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Content based on step */}
        {step === 'intro' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-agora-accent/20">
              <ShieldCheck className="h-8 w-8 text-agora-accent" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-agora-text">{t('verifyWallet')}</h2>
            <p className="mb-6 text-sm text-agora-muted">{t('verificationRequired')}</p>

            <div className="mb-6 rounded-lg bg-agora-card p-4 text-left">
              <h3 className="mb-2 text-sm font-medium text-agora-text">{t('verificationSteps')}</h3>
              <ol className="space-y-2 text-sm text-agora-muted">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-agora-accent/20 text-xs font-medium text-agora-accent">
                    1
                  </span>
                  {t('step1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-agora-accent/20 text-xs font-medium text-agora-accent">
                    2
                  </span>
                  {t('step2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-agora-accent/20 text-xs font-medium text-agora-accent">
                    3
                  </span>
                  {t('step3')}
                </li>
              </ol>
            </div>

            <button
              onClick={handleStartVerification}
              disabled={isVerifying}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSignature className="h-4 w-4" />
              {t('signMessage')}
            </button>
          </div>
        )}

        {step === 'signing' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-agora-accent/20">
              <Loader2 className="h-8 w-8 animate-spin text-agora-accent" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-agora-text">{t('waitingForSignature')}</h2>
            <p className="text-sm text-agora-muted">{t('checkWallet')}</p>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-agora-accent/20">
              <Loader2 className="h-8 w-8 animate-spin text-agora-accent" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-agora-text">{t('verifying')}</h2>
            <p className="text-sm text-agora-muted">{t('pleaseWait')}</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-agora-success/20">
              <CheckCircle className="h-8 w-8 text-agora-success" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-agora-text">{t('verificationSuccess')}</h2>
            <p className="mb-6 text-sm text-agora-muted">{t('canParticipate')}</p>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-agora-success px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-agora-success/80"
            >
              {t('done')}
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-agora-text">{t('verificationFailed')}</h2>
            <p className="mb-6 text-sm text-agora-muted">{errorMessage}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('intro')}
                className="flex-1 rounded-lg bg-agora-card px-4 py-3 text-sm font-medium text-agora-text transition-colors hover:bg-agora-border"
              >
                {t('tryAgain')}
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-agora-accent px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-accent/80"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

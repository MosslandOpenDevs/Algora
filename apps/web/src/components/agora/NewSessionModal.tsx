'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, MessageSquare, Loader2 } from 'lucide-react';

interface NewSessionModalProps {
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

export function NewSessionModal({ onClose, onCreated }: NewSessionModalProps) {
  const t = useTranslations('Agora');
  const [topic, setTopic] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCreate = async () => {
    if (!topic.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201'}/api/agora/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.trim() }),
        }
      );

      if (!response.ok) throw new Error('Failed to create session');

      const data = await response.json();
      onCreated(data.session?.id || data.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl border border-agora-border bg-agora-dark p-6 shadow-2xl animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-agora-primary/20">
            <MessageSquare className="h-5 w-5 text-agora-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('startSession')}</h2>
            <p className="text-sm text-agora-muted">Create a new deliberation session</p>
          </div>
        </div>

        {/* Form */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-900">
            Session Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Budget allocation for Q2 2026"
            className="mt-2 w-full rounded-lg border border-agora-border bg-agora-darker px-4 py-3 text-slate-900 placeholder-agora-muted focus:border-agora-primary focus:outline-none focus:ring-1 focus:ring-agora-primary"
            autoFocus
          />
          <p className="mt-2 text-xs text-agora-muted">
            The topic will be visible to all participants and agents
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCreate}
            disabled={!topic.trim() || isCreating}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-agora-primary px-4 py-2.5 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80 disabled:opacity-50"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                Create Session
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-agora-card px-4 py-2.5 font-medium text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

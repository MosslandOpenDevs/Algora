'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Zap,
  LogOut,
  MessageCircle,
  User,
  Users,
  BarChart3,
  CheckCircle,
  Shield,
  Lightbulb,
  Wrench,
  TrendingUp,
  Eye,
  Scale,
  Brain,
} from 'lucide-react';
import type { Agent } from '@/lib/api';
import { summonAgent, dismissAgent } from '@/lib/api';

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  active: 'bg-agora-success',
  speaking: 'bg-agora-accent',
  listening: 'bg-agora-primary',
};

const statusAnimations: Record<string, string> = {
  idle: '',
  active: 'animate-pulse',
  speaking: 'animate-bounce',
  listening: 'animate-pulse',
};

const groupConfig: Record<string, { icon: typeof Users; color: string; bg: string; border: string; description: string }> = {
  visionaries: {
    icon: Lightbulb,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    description: 'Strategic thinkers who envision long-term possibilities and innovative solutions.',
  },
  builders: {
    icon: Wrench,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    description: 'Technical experts focused on implementation and practical solutions.',
  },
  investors: {
    icon: TrendingUp,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    description: 'Financial analysts who evaluate economic impact and sustainability.',
  },
  guardians: {
    icon: Shield,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    description: 'Security-focused agents who protect the ecosystem from risks.',
  },
  operatives: {
    icon: Zap,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    description: 'Action-oriented agents who drive execution and momentum.',
  },
  moderators: {
    icon: Scale,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    description: 'Balanced perspectives ensuring fair and inclusive discussions.',
  },
  advisors: {
    icon: Brain,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    description: 'Experienced counselors providing wisdom and guidance.',
  },
};

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const t = useTranslations('Agents');
  const queryClient = useQueryClient();
  const status = agent.status || 'idle';
  const [actionSuccess, setActionSuccess] = useState<'summon' | 'dismiss' | null>(null);
  const [mounted, setMounted] = useState(false);

  const group = groupConfig[agent.group_name] || groupConfig.advisors;
  const GroupIcon = group.icon;

  useEffect(() => {
    setMounted(true);
  }, []);

  const summonMutation = useMutation({
    mutationFn: () => summonAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setActionSuccess('summon');
      setTimeout(() => setActionSuccess(null), 2000);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: () => dismissAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setActionSuccess('dismiss');
      setTimeout(() => setActionSuccess(null), 2000);
    },
  });

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
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
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Scrollable content */}
        <div className="max-h-[90vh] overflow-y-auto p-6">
          {/* Agent Header - animate first */}
          <div className="animate-slide-up flex items-start gap-4" style={{ animationDelay: '0ms' }}>
            <div className="relative">
              <div
                className={`
                  flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white
                  ring-4 ring-offset-2 ring-offset-agora-dark
                  ${status !== 'idle' ? 'ring-agora-primary/50 ring-2 ring-agora-primary/30' : 'ring-agora-border'}
                `}
                style={{ backgroundColor: agent.color || '#6366f1' }}
              >
                {agent.display_name?.charAt(0) || agent.name.charAt(0)}
              </div>
              <span
                className={`
                  absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-agora-dark
                  ${statusColors[status]} ${statusAnimations[status]}
                `}
              />
            </div>
            <div className="flex-1 pt-1">
              <h2 className="text-xl font-bold text-slate-900">
                {agent.display_name || agent.name}
              </h2>
              <p className="text-sm text-agora-muted">@{agent.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Group badge */}
                <span
                  className={`
                    inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium
                    ${group.bg} ${group.color} border ${group.border}
                  `}
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                  {t(`groups.${agent.group_name}`)}
                </span>
                {/* Status badge */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    status === 'idle'
                      ? 'bg-gray-500/20 text-gray-400'
                      : status === 'active'
                        ? 'bg-agora-success/20 text-agora-success'
                        : status === 'speaking'
                          ? 'bg-agora-accent/20 text-agora-accent'
                          : 'bg-agora-primary/20 text-agora-primary'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${statusColors[status]} ${statusAnimations[status]}`} />
                  {t(`status.${status}`)}
                </span>
              </div>
            </div>
          </div>

          {/* Group Role Description */}
          <div
            className="animate-slide-up mt-5 rounded-lg border p-3 ${group.border} ${group.bg}"
            style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
          >
            <div className={`flex items-center gap-2 ${group.color}`}>
              <Eye className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Role</span>
            </div>
            <p className="mt-1.5 text-sm text-agora-muted leading-relaxed">
              {group.description}
            </p>
          </div>

          {/* Persona */}
          <div
            className="animate-slide-up mt-5"
            style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <User className="h-4 w-4 text-agora-primary" />
              Persona
            </h3>
            <div className="mt-2 rounded-lg border border-agora-border bg-agora-card p-4">
              <p className="text-sm text-agora-muted leading-relaxed">
                {agent.persona_prompt || 'No persona description available.'}
              </p>
            </div>
          </div>

          {/* Stats Grid */}
          <div
            className="animate-slide-up mt-5 grid grid-cols-3 gap-3"
            style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
          >
            <div className="rounded-lg border border-agora-border bg-agora-card p-3 text-center">
              <MessageCircle className="h-5 w-5 text-agora-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">--</p>
              <p className="text-xs text-agora-muted">Messages</p>
            </div>
            <div className="rounded-lg border border-agora-border bg-agora-card p-3 text-center">
              <Users className="h-5 w-5 text-agora-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">--</p>
              <p className="text-xs text-agora-muted">Sessions</p>
            </div>
            <div className="rounded-lg border border-agora-border bg-agora-card p-3 text-center">
              <BarChart3 className="h-5 w-5 text-agora-success mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">--</p>
              <p className="text-xs text-agora-muted">Trust Score</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div
            className="animate-slide-up mt-5"
            style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageCircle className="h-4 w-4 text-agora-accent" />
              {t('recentActivity')}
            </h3>
            <div className="mt-2 rounded-lg border border-agora-border bg-agora-darker p-4">
              <p className="text-sm text-agora-muted italic">
                {status === 'idle'
                  ? 'Currently idle, waiting to be summoned...'
                  : status === 'speaking'
                    ? 'Currently speaking in Agora...'
                    : status === 'listening'
                      ? 'Listening to the discussion...'
                      : 'Participating in governance activities...'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div
            className="animate-slide-up mt-6 flex gap-3"
            style={{ animationDelay: '250ms', animationFillMode: 'backwards' }}
          >
            {status === 'idle' ? (
              <button
                onClick={() => summonMutation.mutate()}
                disabled={summonMutation.isPending || actionSuccess === 'summon'}
                className={`
                  flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-slate-900
                  transition-all duration-300
                  ${actionSuccess === 'summon'
                    ? 'bg-agora-success'
                    : 'bg-agora-primary hover:bg-agora-primary/80 hover:scale-[1.02]'
                  }
                  disabled:opacity-70
                `}
              >
                {actionSuccess === 'summon' ? (
                  <>
                    <CheckCircle className="h-5 w-5 animate-bounce-in" />
                    Summoned!
                  </>
                ) : summonMutation.isPending ? (
                  <>
                    <Zap className="h-5 w-5 animate-pulse" />
                    Summoning...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    {t('summon')}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => dismissMutation.mutate()}
                disabled={dismissMutation.isPending || actionSuccess === 'dismiss'}
                className={`
                  flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-slate-900
                  transition-all duration-300
                  ${actionSuccess === 'dismiss'
                    ? 'bg-agora-success'
                    : 'bg-agora-card hover:bg-agora-border hover:scale-[1.02]'
                  }
                  disabled:opacity-70
                `}
              >
                {actionSuccess === 'dismiss' ? (
                  <>
                    <CheckCircle className="h-5 w-5 animate-bounce-in" />
                    Dismissed!
                  </>
                ) : dismissMutation.isPending ? (
                  <>
                    <LogOut className="h-5 w-5 animate-pulse" />
                    Dismissing...
                  </>
                ) : (
                  <>
                    <LogOut className="h-5 w-5" />
                    {t('dismiss')}
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-agora-card px-4 py-3 font-medium text-agora-muted transition-all duration-300 hover:bg-agora-border hover:text-slate-900 hover:scale-[1.02]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

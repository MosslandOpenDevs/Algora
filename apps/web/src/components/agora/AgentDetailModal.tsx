'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X, MessageSquare, Zap, Shield } from 'lucide-react';
import type { Agent } from '@/lib/api';

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
  messageCount?: number;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  idle: { label: 'Idle', color: 'text-gray-500', bg: 'bg-gray-500' },
  active: { label: 'Active', color: 'text-agora-success', bg: 'bg-agora-success' },
  speaking: { label: 'Speaking', color: 'text-agora-accent', bg: 'bg-agora-accent' },
  listening: { label: 'Listening', color: 'text-agora-primary', bg: 'bg-agora-primary' },
};

const groupDescriptions: Record<string, string> = {
  visionaries: 'Future-oriented thinkers who envision long-term possibilities and innovative solutions.',
  builders: 'Engineering specialists who focus on technical implementation and system architecture.',
  investors: 'Market watchers who analyze financial implications and investment strategies.',
  guardians: 'Risk management experts who identify and mitigate potential threats.',
  operatives: 'Data collection specialists who gather and process information from various sources.',
  moderators: 'Discussion facilitators who ensure productive and balanced conversations.',
  advisors: 'Domain experts who provide specialized knowledge and guidance.',
  orchestrators: 'Workflow coordinators who manage and optimize governance processes.',
  archivists: 'Document keepers who maintain records and historical data.',
  'red-team': 'Devil\'s advocates who challenge assumptions and test ideas.',
  scouts: 'Opportunity detectors who identify emerging trends and possibilities.',
};

const groupIcons: Record<string, string> = {
  visionaries: '🔮',
  builders: '🔧',
  investors: '📈',
  guardians: '🛡️',
  operatives: '🔍',
  moderators: '⚖️',
  advisors: '💡',
  orchestrators: '🎯',
  archivists: '📚',
  'red-team': '👹',
  scouts: '🔭',
};

export function AgentDetailModal({ agent, onClose, messageCount = 0 }: AgentDetailModalProps) {
  const tAgents = useTranslations('Agents.groups');
  const [mounted, setMounted] = useState(false);

  const status = statusConfig[agent.status || 'idle'] || statusConfig.idle;
  const groupDescription = groupDescriptions[agent.group_name] || 'Governance participant';
  const groupIcon = groupIcons[agent.group_name] || '🤖';

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
          {/* Header with Avatar */}
          <div className="relative">
            {/* Background gradient */}
            <div
              className="h-24 w-full"
              style={{
                background: `linear-gradient(135deg, ${agent.color}40 0%, ${agent.color}20 100%)`
              }}
            />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Avatar */}
            <div className="absolute -bottom-10 left-6">
              <div className="relative">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white border-4 border-agora-dark shadow-lg"
                  style={{ backgroundColor: agent.color || '#6366f1' }}
                >
                  {agent.display_name?.charAt(0) || agent.name.charAt(0)}
                </div>
                {/* Status indicator */}
                <span
                  className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-agora-dark ${status.bg} ${agent.status === 'speaking' ? 'animate-pulse' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pt-14 pb-6">
            {/* Name and Status */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {agent.display_name || agent.name}
                </h2>
                <p className="text-sm text-agora-muted">@{agent.name}</p>
              </div>
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${status.color} bg-agora-card`}>
                <span className={`h-2 w-2 rounded-full ${status.bg} ${agent.status === 'speaking' ? 'animate-pulse' : ''}`} />
                {status.label}
              </span>
            </div>

            {/* Group Badge */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-lg">{groupIcon}</span>
              <span
                className="rounded-full px-3 py-1 text-sm font-medium"
                style={{
                  backgroundColor: `${agent.color}20`,
                  color: agent.color
                }}
              >
                {tAgents(agent.group_name)}
              </span>
            </div>

            {/* Group Description */}
            <p className="mt-3 text-sm text-agora-muted leading-relaxed">
              {groupDescription}
            </p>

            {/* Persona */}
            {agent.persona_prompt && (
              <div className="mt-4 rounded-lg bg-agora-card p-4 border border-agora-border">
                <h4 className="flex items-center gap-2 text-xs font-semibold text-agora-muted uppercase tracking-wide mb-2">
                  <Shield className="h-3 w-3" />
                  Persona
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">
                  {agent.persona_prompt}
                </p>
              </div>
            )}

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-agora-card p-3 text-center border border-agora-border">
                <MessageSquare className="h-5 w-5 mx-auto text-agora-primary mb-1" />
                <p className="text-lg font-bold text-slate-900">{messageCount}</p>
                <p className="text-xs text-agora-muted">Messages</p>
              </div>
              <div className="rounded-lg bg-agora-card p-3 text-center border border-agora-border">
                <Zap className="h-5 w-5 mx-auto text-agora-accent mb-1" />
                <p className="text-lg font-bold text-slate-900">
                  {agent.status === 'speaking' ? 'Active' : agent.status === 'active' ? 'Ready' : 'Idle'}
                </p>
                <p className="text-xs text-agora-muted">Status</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-agora-border px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-border"
            >
              Close
            </button>
          </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

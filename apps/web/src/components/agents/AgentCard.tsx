'use client';

import { useTranslations } from 'next-intl';
import { MessageCircle, Zap } from 'lucide-react';
import type { Agent } from '@/lib/api';

interface AgentCardProps {
  agent: Agent;
  index?: number;
  onClick?: () => void;
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

const groupColors: Record<string, { bg: string; text: string; border: string }> = {
  visionaries: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  builders: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  investors: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  guardians: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  operatives: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  moderators: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  advisors: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
};

export function AgentCard({ agent, index = 0, onClick }: AgentCardProps) {
  const t = useTranslations('Agents');
  const status = agent.status || 'idle';
  const groupStyle = groupColors[agent.group_name] || groupColors.advisors;

  // Calculate stagger delay
  const delayMs = Math.min(index * 50, 400);

  const isActiveState = status === 'speaking' || status === 'active';

  return (
    <div
      onClick={onClick}
      className={`
        group cursor-pointer rounded-lg border bg-agora-card p-4
        animate-slide-up
        transition-all duration-300
        hover:scale-[1.02] hover:shadow-lg hover:shadow-agora-primary/10
        ${isActiveState ? 'border-agora-primary/50 ring-2 ring-agora-primary/30' : 'border-agora-border hover:border-agora-primary/50'}
      `}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'backwards',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="relative">
          {/* Avatar with glow ring on hover */}
          <div
            className={`
              flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white
              transition-all duration-300
              group-hover:scale-110 group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-agora-card
              ${isActiveState ? 'ring-2 ring-agora-primary/50' : 'group-hover:ring-agora-primary/50'}
            `}
            style={{ backgroundColor: agent.color || '#6366f1' }}
          >
            {agent.display_name?.charAt(0) || agent.name.charAt(0)}
          </div>
          {/* Status indicator */}
          <span
            className={`
              absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-agora-card
              ${statusColors[status]} ${statusAnimations[status]}
              transition-all duration-300
            `}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 truncate group-hover:text-agora-primary transition-colors">
            {agent.display_name || agent.name}
          </h3>
          {/* Group badge with color */}
          <span
            className={`
              inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium
              ${groupStyle.bg} ${groupStyle.text} border ${groupStyle.border}
            `}
          >
            {t(`groups.${agent.group_name}`)}
          </span>
        </div>
      </div>

      {/* Status Bar */}
      <div className="mt-3 flex items-center justify-between">
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
          <span
            className={`h-2 w-2 rounded-full ${statusColors[status]} ${statusAnimations[status]}`}
          />
          {t(`status.${status}`)}
        </span>

        {/* Activity indicator */}
        <div className="flex items-center gap-1">
          {status === 'speaking' && (
            <MessageCircle className="h-4 w-4 text-agora-accent animate-pulse" />
          )}
          {status === 'active' && (
            <Zap className="h-4 w-4 text-agora-success animate-pulse" />
          )}
        </div>
      </div>

      {/* Persona preview on hover */}
      {agent.persona_prompt && (
        <div className="mt-3 overflow-hidden transition-all duration-300 max-h-0 group-hover:max-h-12">
          <p className="text-xs text-agora-muted line-clamp-2 italic">
            "{agent.persona_prompt.slice(0, 80)}..."
          </p>
        </div>
      )}

      {/* Hover action hint */}
      <div className="mt-2 flex items-center justify-center gap-1 text-xs text-agora-muted opacity-0 transition-all duration-300 group-hover:opacity-100">
        <span>Click to view details</span>
      </div>
    </div>
  );
}

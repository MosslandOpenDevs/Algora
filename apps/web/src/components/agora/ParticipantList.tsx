'use client';

import { useTranslations } from 'next-intl';
import { Users, Zap } from 'lucide-react';
import type { Agent } from '@/lib/api';

interface ParticipantListProps {
  agents: Agent[];
  participants: string[];
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  active: 'bg-agora-success',
  speaking: 'bg-agora-accent',
  listening: 'bg-agora-primary',
};

const groupColors: Record<string, string> = {
  visionaries: 'text-purple-400',
  builders: 'text-blue-400',
  investors: 'text-green-400',
  guardians: 'text-red-400',
  operatives: 'text-yellow-400',
  moderators: 'text-pink-400',
  advisors: 'text-cyan-400',
};

const statusAnimations: Record<string, string> = {
  idle: '',
  active: 'animate-pulse',
  speaking: 'animate-bounce',
  listening: 'animate-pulse',
};

export function ParticipantList({ agents, participants }: ParticipantListProps) {
  const t = useTranslations('Agora');
  const tAgents = useTranslations('Agents.groups');

  const participantAgents = agents.filter((a) => participants.includes(a.id));
  const availableAgents = agents.filter(
    (a) => !participants.includes(a.id) && (a.status === 'idle' || !a.status)
  );

  // Sort participants by status (speaking first, then active, then others)
  const sortedParticipants = [...participantAgents].sort((a, b) => {
    const statusOrder: Record<string, number> = { speaking: 0, active: 1, listening: 2, idle: 3 };
    return (statusOrder[a.status || 'idle'] || 3) - (statusOrder[b.status || 'idle'] || 3);
  });

  return (
    <div className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900">
        <Users className="h-4 w-4" />
        Participants ({participantAgents.length})
      </h3>

      {/* Active Participants */}
      <div className="mt-4 space-y-2">
        {sortedParticipants.length > 0 ? (
          sortedParticipants.map((agent, index) => {
            const isSpeaking = agent.status === 'speaking';
            const isActive = agent.status === 'active' || agent.status === 'listening';

            return (
              <div
                key={agent.id}
                className={`
                  animate-slide-up flex items-center gap-2 rounded-lg p-2
                  transition-all duration-300
                  ${isSpeaking
                    ? 'bg-agora-accent/10 border border-agora-accent/30'
                    : isActive
                      ? 'bg-agora-success/10 border border-agora-success/30'
                      : 'bg-agora-darker'
                  }
                `}
                style={{
                  animationDelay: `${index * 50}ms`,
                  animationFillMode: 'backwards',
                }}
              >
                <div className="relative">
                  <div
                    className={`
                      flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white
                      transition-transform duration-300
                      ${isSpeaking ? 'scale-110 ring-2 ring-agora-accent/50' : ''}
                    `}
                    style={{ backgroundColor: agent.color || '#6366f1' }}
                  >
                    {agent.display_name?.charAt(0) || agent.name.charAt(0)}
                  </div>
                  <span
                    className={`
                      absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-agora-darker
                      ${statusColors[agent.status || 'idle']} ${statusAnimations[agent.status || 'idle']}
                    `}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSpeaking ? 'text-agora-accent' : 'text-slate-900'}`}>
                    {agent.display_name || agent.name}
                    {isSpeaking && <span className="ml-2 text-xs">🎤</span>}
                  </p>
                  <p className={`text-xs ${groupColors[agent.group_name] || 'text-agora-muted'}`}>
                    {tAgents(agent.group_name)}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-agora-muted animate-fade-in">No participants yet</p>
        )}
      </div>

      {/* Summon More */}
      {availableAgents.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-agora-muted uppercase tracking-wide">
            {t('summonAgent')}
          </h4>
          <div className="mt-2 flex flex-wrap gap-1">
            {availableAgents.slice(0, 6).map((agent, index) => (
              <button
                key={agent.id}
                className="
                  group flex items-center gap-1 rounded-full bg-agora-darker px-2 py-1 text-xs text-agora-muted
                  transition-all duration-200
                  hover:bg-agora-primary hover:text-slate-900 hover:scale-105
                "
                style={{
                  animationDelay: `${index * 30}ms`,
                }}
                title={agent.display_name || agent.name}
              >
                <Zap className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="truncate max-w-[60px]">
                  {agent.display_name || agent.name}
                </span>
              </button>
            ))}
            {availableAgents.length > 6 && (
              <span className="flex items-center px-2 text-xs text-agora-muted">
                +{availableAgents.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

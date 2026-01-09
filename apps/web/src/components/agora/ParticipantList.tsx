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

export function ParticipantList({ agents, participants }: ParticipantListProps) {
  const t = useTranslations('Agora');

  const participantAgents = agents.filter((a) => participants.includes(a.id));
  const availableAgents = agents.filter(
    (a) => !participants.includes(a.id) && (a.status === 'idle' || !a.status)
  );

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-4">
      <h3 className="flex items-center gap-2 font-semibold text-white">
        <Users className="h-4 w-4" />
        Participants
      </h3>

      {/* Active Participants */}
      <div className="mt-4 space-y-2">
        {participantAgents.length > 0 ? (
          participantAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2 rounded-lg bg-agora-darker p-2"
            >
              <div className="relative">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: agent.color || '#6366f1' }}
                >
                  {agent.display_name?.charAt(0) || agent.name.charAt(0)}
                </div>
                <span
                  className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-agora-darker ${statusColors[agent.status || 'idle']}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {agent.display_name || agent.name}
                </p>
                <p className="text-xs text-agora-muted">
                  {t(`status.${agent.status || 'idle'}`)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-agora-muted">No participants yet</p>
        )}
      </div>

      {/* Summon More */}
      {availableAgents.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-agora-muted uppercase tracking-wide">
            {t('summonAgent')}
          </h4>
          <div className="mt-2 flex flex-wrap gap-1">
            {availableAgents.slice(0, 6).map((agent) => (
              <button
                key={agent.id}
                className="group flex items-center gap-1 rounded-full bg-agora-darker px-2 py-1 text-xs text-agora-muted transition-colors hover:bg-agora-primary hover:text-white"
                title={agent.display_name || agent.name}
              >
                <Zap className="h-3 w-3 opacity-0 group-hover:opacity-100" />
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

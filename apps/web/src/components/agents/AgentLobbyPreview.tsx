'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { fetchAgents, type Agent } from '@/lib/api';

interface AgentLobbyPreviewProps {
  onAgentClick?: (agent: Agent) => void;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  active: 'bg-agora-success',
  speaking: 'bg-agora-accent animate-pulse',
  listening: 'bg-agora-primary',
  null: 'bg-gray-500',
};

export function AgentLobbyPreview({ onAgentClick }: AgentLobbyPreviewProps) {
  const t = useTranslations('Agents');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 rounded-lg bg-agora-darker p-3"
          >
            <div className="h-10 w-10 rounded-full bg-agora-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-agora-border" />
              <div className="h-3 w-1/3 rounded bg-agora-border" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const activeAgents =
    agents?.filter((a: Agent) => a.status && a.status !== 'idle').slice(0, 5) || [];
  const displayAgents =
    activeAgents.length > 0 ? activeAgents : agents?.slice(0, 5) || [];

  return (
    <div className="space-y-3">
      {displayAgents.map((agent: Agent) => (
        <button
          key={agent.id}
          onClick={() => onAgentClick?.(agent)}
          className="flex w-full items-center gap-3 rounded-lg bg-agora-darker p-3 text-left transition-colors hover:bg-agora-darker/80 hover:ring-1 hover:ring-agora-border"
        >
          <div className="relative">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: agent.color || '#6366f1' }}
            >
              {agent.display_name?.charAt(0) || agent.name.charAt(0)}
            </div>
            <span
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-agora-darker ${statusColors[agent.status || 'idle']}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {agent.display_name || agent.name}
            </p>
            <p className="text-xs text-agora-muted truncate">
              {t(`groups.${agent.group_name}`)} · {t(`status.${agent.status || 'idle'}`)}
            </p>
          </div>
        </button>
      ))}

      <Link
        href={`/${locale}/agents`}
        className="flex items-center justify-center gap-2 rounded-lg border border-agora-border bg-agora-darker px-4 py-2 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
      >
        <span>View all agents</span>
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

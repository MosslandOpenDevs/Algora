'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { TerminalBox, StatusGlyph } from './TerminalBox';
import { GlowText } from './GlowText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface SystemBlueprintProps {
  className?: string;
}

interface PipelineStats {
  signals: { count: number; rate: string };
  analysis: { agents: number };
  issues: { open: number };
  agora: { sessions: number; currentSession?: { id: string; round: number; maxRounds: number } };
  proposals: { active: number };
  executed: { count: number };
}

async function fetchPipelineStats(): Promise<PipelineStats> {
  const [signalsRes, statsRes, sessionsRes] = await Promise.all([
    fetch(`${API_URL}/api/signals/live-stats`),
    fetch(`${API_URL}/api/stats`),
    fetch(`${API_URL}/api/agora/sessions?status=active`),
  ]);

  const signalsData = await signalsRes.json();
  const stats = await statsRes.json();
  const sessionsData = await sessionsRes.json();
  // sessions endpoint might return array or { sessions: [...] }
  const sessions = Array.isArray(sessionsData) ? sessionsData : (sessionsData.sessions || []);

  return {
    signals: {
      count: signalsData.timeStats?.thisMonth || 0,
      rate: `${signalsData.ratePerMinute || 0}/min`
    },
    analysis: { agents: 30 },
    issues: { open: stats.openIssues || 0 },
    agora: {
      sessions: stats.activeSessions || 0,
      currentSession: sessions[0]
        ? {
            id: sessions[0].id,
            round: sessions[0].current_round || 1,
            maxRounds: sessions[0].max_rounds || 5,
          }
        : undefined,
    },
    proposals: { active: 0 },
    executed: { count: 0 },
  };
}

// Pipeline node component
function PipelineNode({
  label,
  value,
  subtext,
  active = true,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  active?: boolean;
}) {
  return (
    <div
      className={clsx(
        'border rounded px-3 py-2 text-center min-w-[80px]',
        active ? 'border-[var(--live-border-bright)] bg-[var(--live-card)]' : 'border-[var(--live-border)] bg-transparent'
      )}
    >
      <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">{label}</div>
      <div className={clsx('text-sm font-semibold tabular-nums', active ? 'text-[var(--live-glow)]' : 'text-[var(--text-dim)]')}>
        {value}
      </div>
      {subtext && <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{subtext}</div>}
    </div>
  );
}

// Animated arrow between nodes
function PipelineArrow({ animated = false }: { animated?: boolean }) {
  return (
    <div className="flex items-center px-1">
      <div className="relative">
        <span className="text-[var(--live-glow)] text-xs">══▶</span>
        {animated && (
          <span className="absolute inset-0 text-[var(--live-glow)] text-xs opacity-50 animate-data-flow">
            ══▶
          </span>
        )}
      </div>
    </div>
  );
}

// Agora visualization with agents
function AgoraNode({
  sessions,
  currentSession,
}: {
  sessions: number;
  currentSession?: { id: string; round: number; maxRounds: number };
}) {
  const sampleAgents = [
    { name: 'Whale', status: 'active' as const },
    { name: 'Rust', status: 'speaking' as const },
    { name: 'Chaos', status: 'active' as const },
    { name: 'DAO', status: 'idle' as const },
  ];

  return (
    <div className="border border-[var(--live-border-bright)] rounded px-4 py-3 bg-[var(--live-card)]">
      <div className="text-center">
        <span className="text-[var(--live-glow)] text-sm font-bold tracking-wider">
          AGORA
        </span>
      </div>

      {/* Agent dots */}
      <div className="flex justify-center gap-2 mt-2">
        {sampleAgents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-1">
            <StatusGlyph status={agent.status} size="sm" />
            <span className="text-[10px] text-[var(--text-muted)]">{agent.name}</span>
          </div>
        ))}
      </div>

      {/* Session info */}
      {currentSession ? (
        <div className="text-center mt-2 text-[10px] text-[var(--text-muted)] tabular-nums">
          Session #{currentSession.id.slice(0, 4)} | Round {currentSession.round}/{currentSession.maxRounds}
        </div>
      ) : (
        <div className="text-center mt-2 text-[10px] text-[var(--text-dim)]">
          {sessions} active sessions
        </div>
      )}
    </div>
  );
}

export function SystemBlueprint({ className }: SystemBlueprintProps) {
  const [dataFlowing, setDataFlowing] = useState(true);

  const { data: stats } = useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: fetchPipelineStats,
    refetchInterval: 10000,
  });

  // Simulate data flow animation
  useEffect(() => {
    const interval = setInterval(() => {
      setDataFlowing((prev) => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TerminalBox title="SYSTEM BLUEPRINT" className={className}>
      <div className="py-4">
        {/* Top row: Input pipeline */}
        <div className="flex items-center justify-center gap-1 flex-wrap">
          <PipelineNode
            label="SIGNALS"
            value={stats?.signals.count.toLocaleString() || '—'}
            subtext={stats?.signals.rate}
            active
          />
          <PipelineArrow animated={dataFlowing} />
          <PipelineNode
            label="ANALYSIS"
            value={stats?.analysis.agents || '—'}
            subtext="agents"
            active
          />
          <PipelineArrow animated={dataFlowing} />
          <PipelineNode
            label="ISSUES"
            value={stats?.issues.open || '—'}
            subtext="open"
            active
          />
        </div>

        {/* Center: Agora */}
        <div className="flex justify-center my-4">
          <div className="flex flex-col items-center">
            <span className="text-[var(--live-glow)] text-xs mb-1">▼</span>
            <AgoraNode
              sessions={stats?.agora.sessions || 0}
              currentSession={stats?.agora.currentSession}
            />
            <span className="text-[var(--live-glow)] text-xs mt-1">▼</span>
          </div>
        </div>

        {/* Bottom row: Output pipeline */}
        <div className="flex items-center justify-center gap-1 flex-wrap">
          <PipelineNode
            label="PROPOSALS"
            value={stats?.proposals.active || 0}
            subtext="active"
            active={!!stats?.proposals.active}
          />
          <PipelineArrow animated={false} />
          <PipelineNode
            label="VOTING"
            value="—"
            subtext="pending"
            active={false}
          />
          <PipelineArrow animated={false} />
          <PipelineNode
            label="EXECUTE"
            value={stats?.executed.count || 0}
            subtext="completed"
            active={false}
          />
        </div>
      </div>
    </TerminalBox>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { TerminalBox, StatusGlyph, BlinkingCursor } from './TerminalBox';
import { ASCIIProgress } from './GlowText';
import { useSocket } from '@/hooks/useSocket';
import { useTranslationToggle } from '@/hooks/useTranslation';
import { TranslatedText } from '@/components/ui/TranslatedText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

interface AgoraSession {
  id: string;
  title: string;
  status: string;
  current_round: number;
  max_rounds: number;
  consensus_score: number;
  created_at: string;
  participants: Array<{
    agent_id: string;
    agent_name: string;
    agent_color: string;
    status: 'speaking' | 'active' | 'idle';
  }>;
  lastMessage?: {
    agent_name: string;
    content: string;
    created_at: string;
  };
}

interface AgoraPreviewProps {
  className?: string;
}

async function fetchActiveSession(): Promise<AgoraSession | null> {
  const res = await fetch(`${API_URL}/api/agora/sessions?status=active&limit=1`);
  if (!res.ok) throw new Error('Failed to fetch session');
  const data = await res.json();
  // API returns { sessions: [...] }
  const sessions = data.sessions || [];
  if (sessions.length === 0) return null;

  const session = sessions[0];

  // Fetch participants
  const participantsRes = await fetch(`${API_URL}/api/agora/sessions/${session.id}/participants`);
  const participantsData = participantsRes.ok ? await participantsRes.json() : {};
  const participants = participantsData.participants || [];

  // Fetch last message (session detail includes messages)
  const messagesRes = await fetch(`${API_URL}/api/agora/sessions/${session.id}`);
  const sessionDetail = messagesRes.ok ? await messagesRes.json() : {};

  return {
    ...session,
    participants,
    lastMessage: sessionDetail.messages?.[0],
  };
}

export function AgoraPreview({ className }: AgoraPreviewProps) {
  const [session, setSession] = useState<AgoraSession | null>(null);
  const { subscribe, isConnected } = useSocket();
  const { showTranslation, toggle: toggleTranslation } = useTranslationToggle();

  // Initial fetch
  const { data: initialSession } = useQuery({
    queryKey: ['active-session'],
    queryFn: fetchActiveSession,
    refetchInterval: 15000,
  });

  // Set initial session
  useEffect(() => {
    if (initialSession !== undefined) {
      setSession(initialSession);
    }
  }, [initialSession]);

  // Subscribe to session updates
  useEffect(() => {
    if (!isConnected || !session) return;

    const unsubMessage = subscribe('agora:message', (data: unknown) => {
      const { sessionId } = data as { sessionId: string; message: unknown };
      if (sessionId === session.id) {
        // Refresh session data
        fetchActiveSession().then(setSession);
      }
    });

    return unsubMessage;
  }, [isConnected, subscribe, session?.id]);

  if (!session) {
    return (
      <TerminalBox title="AGORA SESSION" className={className}>
        <div className="text-center text-[var(--text-muted)] text-xs py-8">
          <div className="mb-2">No active sessions</div>
          <div className="text-[var(--text-dim)]">The agora awaits its next debate...</div>
        </div>
      </TerminalBox>
    );
  }

  const speakingAgent = session.participants?.find((p) => p.status === 'speaking');

  return (
    <TerminalBox
      title={`AGORA SESSION #${session.id.slice(0, 4).toUpperCase()}`}
      className={className}
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTranslation}
            className={clsx(
              'flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors',
              showTranslation
                ? 'bg-[var(--live-glow)]/20 text-[var(--live-glow)]'
                : 'bg-[var(--live-border)]/50 text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
            title={showTranslation ? 'Show original (English)' : 'Show Korean translation'}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            <span>{showTranslation ? '한글' : 'EN'}</span>
          </button>
          <StatusGlyph status="active" size="sm" />
        </div>
      }
    >
      <div className="space-y-3">
        {/* Topic */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase mb-1">Topic</div>
          <div className="text-sm text-[var(--text-bright)] line-clamp-2">{session.title}</div>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">
            Round {session.current_round}/{session.max_rounds}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">Consensus:</span>
            <ASCIIProgress
              value={session.consensus_score || 0}
              max={100}
              width={8}
              showPercent
            />
          </div>
        </div>

        {/* Current speaker */}
        {speakingAgent && (
          <div className="border-t border-[var(--live-border)] pt-3">
            <div className="flex items-center gap-2 mb-2">
              <StatusGlyph status="speaking" />
              <span
                className="text-xs font-medium"
                style={{ color: speakingAgent.agent_color }}
              >
                &lt;{speakingAgent.agent_name}&gt;
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">[speaking]</span>
            </div>
            {session.lastMessage && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed pl-4 border-l border-[var(--live-border)]">
                <TranslatedText
                  text={session.lastMessage.content.slice(0, 150) + (session.lastMessage.content.length > 150 ? '...' : '')}
                  showTranslation={showTranslation}
                  targetLanguage="ko"
                  loadingText="..."
                />
                <BlinkingCursor className="ml-0.5" />
              </p>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="flex flex-wrap gap-2 pt-2">
          {session.participants?.slice(0, 6).map((p) => (
            <div key={p.agent_id} className="flex items-center gap-1">
              <StatusGlyph status={p.status || 'idle'} size="sm" />
              <span
                className="text-[10px]"
                style={{ color: p.agent_color || 'var(--text-muted)' }}
              >
                {p.agent_name}
              </span>
            </div>
          ))}
          {(session.participants?.length || 0) > 6 && (
            <span className="text-[10px] text-[var(--text-dim)]">
              +{session.participants.length - 6} more
            </span>
          )}
        </div>
      </div>
    </TerminalBox>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Users,
  Send,
  Plus,
} from 'lucide-react';

import { fetchAgents, fetchAgoraSessions, fetchSessionWithMessages, type AgoraSession, type AgoraMessage } from '@/lib/api';
import { SessionCard } from '@/components/agora/SessionCard';
import { ChatMessage } from '@/components/agora/ChatMessage';
import { ParticipantList } from '@/components/agora/ParticipantList';
import { NewSessionModal } from '@/components/agora/NewSessionModal';
import { SessionDetailModal } from '@/components/agora/SessionDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

// Helper to parse summoned_agents JSON string
function parseParticipants(summoned_agents: string | null): string[] {
  if (!summoned_agents) return [];
  try {
    const parsed = JSON.parse(summoned_agents);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AgoraPage() {
  const t = useTranslations('Agora');
  const tGuide = useTranslations('Guide.tooltips');
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [detailSession, setDetailSession] = useState<AgoraSession | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['agora-sessions'],
    queryFn: fetchAgoraSessions,
    refetchInterval: 5000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  });

  // Fetch messages for active session
  const { data: sessionData } = useQuery({
    queryKey: ['agora-session', activeSessionId],
    queryFn: () => fetchSessionWithMessages(activeSessionId!),
    enabled: !!activeSessionId,
    refetchInterval: 3000,
  });

  const activeSession = sessionData?.session || sessions?.find((s: AgoraSession) => s.id === activeSessionId);
  const messages = sessionData?.messages || [];
  const activeSessions = sessions?.filter((s: AgoraSession) => s.status === 'active') || [];
  const pendingSessions = sessions?.filter((s: AgoraSession) => s.status === 'pending') || [];
  const concludedSessions = sessions?.filter((s: AgoraSession) => s.status === 'concluded' || s.status === 'completed') || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    // TODO: Implement actual message sending via WebSocket
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
            <HelpTooltip content={tGuide('agora')} />
          </div>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowNewSession(true)}
          className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
        >
          <Plus className="h-4 w-4" />
          {t('startSession')}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto pr-2">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Active Sessions ({activeSessions.length})
              </h3>
              <div className="space-y-2">
                {activeSessions.map((session: AgoraSession) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSessionId(session.id)}
                    onDetailClick={() => setDetailSession(session)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Sessions */}
          {pendingSessions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-agora-muted">
                Pending ({pendingSessions.length})
              </h3>
              <div className="space-y-2">
                {pendingSessions.map((session: AgoraSession) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSessionId(session.id)}
                    onDetailClick={() => setDetailSession(session)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {concludedSessions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-agora-muted">
                Recent ({concludedSessions.length})
              </h3>
              <div className="space-y-2">
                {concludedSessions.slice(0, 5).map((session: AgoraSession) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSessionId(session.id)}
                    onDetailClick={() => setDetailSession(session)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Sessions */}
          {!sessionsLoading && !sessions?.length && (
            <div className="rounded-lg border border-dashed border-agora-border p-4 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-agora-muted" />
              <p className="mt-2 text-sm text-agora-muted">{t('noActiveSession')}</p>
              <button
                onClick={() => setShowNewSession(true)}
                className="mt-3 text-sm text-agora-primary hover:underline"
              >
                {t('startSession')}
              </button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col rounded-lg border border-agora-border bg-agora-card">
          {activeSession ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-agora-border p-4">
                <div>
                  <h2 className="font-semibold text-slate-900">{activeSession.title}</h2>
                  <p className="text-xs text-agora-muted">
                    Session started {activeSession.created_at ? new Date(activeSession.created_at).toLocaleString() : 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-agora-muted">
                  <Users className="h-4 w-4" />
                  <span>{parseParticipants(activeSession.summoned_agents).length} participants</span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  {messages.length > 0 ? (
                    messages.map((msg: AgoraMessage) => (
                      <ChatMessage
                        key={msg.id}
                        message={{
                          id: msg.id,
                          agentId: msg.agent_id || '',
                          agentName: msg.display_name || msg.agent_name || 'Unknown',
                          agentColor: msg.color || '#6366f1',
                          content: msg.content,
                          timestamp: msg.created_at,
                          tier: msg.tier_used,
                        }}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-agora-muted">
                      <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>No messages yet. Start the discussion!</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input */}
              <div className="border-t border-agora-border p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('sendMessage')}
                    className="flex-1 rounded-lg border border-agora-border bg-agora-darker px-4 py-2 text-slate-900 placeholder-agora-muted focus:border-agora-primary focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                    className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-slate-900 transition-colors hover:bg-agora-primary/80 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageSquare className="h-16 w-16 text-agora-muted/50" />
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {t('noActiveSession')}
              </h3>
              <p className="mt-2 text-sm text-agora-muted">
                Select a session from the sidebar or start a new one
              </p>
              <button
                onClick={() => setShowNewSession(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-slate-900 transition-colors hover:bg-agora-primary/80"
              >
                <Plus className="h-4 w-4" />
                {t('startSession')}
              </button>
            </div>
          )}
        </div>

        {/* Participants Sidebar */}
        {activeSession && (
          <div className="w-64 flex-shrink-0">
            <ParticipantList
              agents={agents || []}
              participants={parseParticipants(activeSession.summoned_agents)}
            />
          </div>
        )}
      </div>

      {/* New Session Modal */}
      {showNewSession && (
        <NewSessionModal
          onClose={() => setShowNewSession(false)}
          onCreated={(sessionId) => {
            setActiveSessionId(sessionId);
            setShowNewSession(false);
            queryClient.invalidateQueries({ queryKey: ['agora-sessions'] });
          }}
        />
      )}

      {/* Session Detail Modal */}
      {detailSession && (
        <SessionDetailModal
          session={detailSession}
          agents={agents || []}
          onClose={() => setDetailSession(null)}
          onJoinSession={() => {
            setActiveSessionId(detailSession.id);
            setDetailSession(null);
          }}
        />
      )}
    </div>
  );
}

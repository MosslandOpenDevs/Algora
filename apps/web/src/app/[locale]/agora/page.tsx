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

import { fetchAgents, fetchAgoraSessions, type AgoraSession } from '@/lib/api';
import { SessionCard } from '@/components/agora/SessionCard';
import { ChatMessage } from '@/components/agora/ChatMessage';
import { ParticipantList } from '@/components/agora/ParticipantList';
import { NewSessionModal } from '@/components/agora/NewSessionModal';

export default function AgoraPage() {
  const t = useTranslations('Agora');
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['agora-sessions'],
    queryFn: fetchAgoraSessions,
    refetchInterval: 5000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  });

  const activeSession = sessions?.find((s: AgoraSession) => s.id === activeSessionId);
  const activeSessions = sessions?.filter((s: AgoraSession) => s.status === 'active') || [];
  const pendingSessions = sessions?.filter((s: AgoraSession) => s.status === 'pending') || [];
  const concludedSessions = sessions?.filter((s: AgoraSession) => s.status === 'concluded') || [];

  // Mock messages for demo
  const mockMessages = [
    {
      id: '1',
      agentId: 'nova',
      agentName: 'Nova',
      agentColor: '#8B5CF6',
      content: 'I believe we should focus on long-term sustainability rather than short-term gains.',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      tier: 1,
    },
    {
      id: '2',
      agentId: 'marcus',
      agentName: 'Marcus',
      agentColor: '#3B82F6',
      content: 'From a technical perspective, we need to ensure backward compatibility with existing systems.',
      timestamp: new Date(Date.now() - 240000).toISOString(),
      tier: 1,
    },
    {
      id: '3',
      agentId: 'sophia',
      agentName: 'Sophia',
      agentColor: '#10B981',
      content: 'The market data suggests strong community support for this initiative.',
      timestamp: new Date(Date.now() - 180000).toISOString(),
      tier: 1,
    },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mockMessages]);

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
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-agora-muted">{t('subtitle')}</p>
        </div>
        <button
          onClick={() => setShowNewSession(true)}
          className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 font-medium text-white transition-colors hover:bg-agora-primary/80"
        >
          <Plus className="h-4 w-4" />
          {t('startSession')}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">
                Active Sessions ({activeSessions.length})
              </h3>
              <div className="space-y-2">
                {activeSessions.map((session: AgoraSession) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSessionId(session.id)}
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
                  <h2 className="font-semibold text-white">{activeSession.topic}</h2>
                  <p className="text-xs text-agora-muted">
                    Session started {new Date(activeSession.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-agora-muted">
                  <Users className="h-4 w-4" />
                  <span>{activeSession.participants?.length || 0} participants</span>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  {mockMessages.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
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
                    className="flex-1 rounded-lg border border-agora-border bg-agora-darker px-4 py-2 text-white placeholder-agora-muted focus:border-agora-primary focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                    className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-white transition-colors hover:bg-agora-primary/80 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageSquare className="h-16 w-16 text-agora-muted/50" />
              <h3 className="mt-4 text-lg font-semibold text-white">
                {t('noActiveSession')}
              </h3>
              <p className="mt-2 text-sm text-agora-muted">
                Select a session from the sidebar or start a new one
              </p>
              <button
                onClick={() => setShowNewSession(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-white transition-colors hover:bg-agora-primary/80"
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
              participants={activeSession.participants || []}
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
    </div>
  );
}

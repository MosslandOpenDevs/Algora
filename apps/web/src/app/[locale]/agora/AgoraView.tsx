'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Users,
  Send,
  Plus,
  Loader2,
  Languages,
  PanelLeftOpen,
} from 'lucide-react';
import { useTranslationToggle } from '@/hooks/useTranslation';

import { fetchAgents, fetchAgoraSessions, fetchSessionWithMessages, sendAgoraMessage, type AgoraSession, type AgoraMessage, type Agent } from '@/lib/api';
import { SessionCard } from '@/components/agora/SessionCard';
import { ChatMessage } from '@/components/agora/ChatMessage';
import { ParticipantList } from '@/components/agora/ParticipantList';
import { NewSessionModal } from '@/components/agora/NewSessionModal';
import { SessionDetailModal } from '@/components/agora/SessionDetailModal';
import { AgentDetailModal } from '@/components/agora/AgentDetailModal';
import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

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
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const { showTranslation, toggle: toggleTranslation } = useTranslationToggle();
  const [showSessionsSidebar, setShowSessionsSidebar] = useState(false);
  const [showParticipantsSidebar, setShowParticipantsSidebar] = useState(false);

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['agora-sessions'],
    queryFn: fetchAgoraSessions,
    refetchInterval: 5000,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  });

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

  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async () => {
    if (!message.trim() || !activeSessionId || isSending) return;

    setIsSending(true);
    try {
      await sendAgoraMessage(activeSessionId, message.trim());
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['agora-session', activeSessionId] });
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAgentClick = (agentId: string) => {
    const agent = agents?.find(a => a.id === agentId || a.name === agentId);
    if (agent) {
      setSelectedAgent(agent);
    }
  };

  const getAgentMessageCount = (agentId: string) => {
    return messages.filter(m => m.agent_id === agentId).length;
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setShowSessionsSidebar(false);
  };

  // Sessions list content (shared between sidebar and sheet)
  const sessionsContent = (
    <div className="space-y-4">
      {activeSessions.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
            Active Sessions ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.map((session: AgoraSession) => (
              <SessionCard
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onClick={() => handleSelectSession(session.id)}
                onDetailClick={() => setDetailSession(session)}
              />
            ))}
          </div>
        </div>
      )}

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
                onClick={() => handleSelectSession(session.id)}
                onDetailClick={() => setDetailSession(session)}
              />
            ))}
          </div>
        </div>
      )}

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
                onClick={() => handleSelectSession(session.id)}
                onDetailClick={() => setDetailSession(session)}
              />
            ))}
          </div>
        </div>
      )}

      {!sessionsLoading && !sessions?.length && (
        <div className="rounded-lg border border-dashed border-agora-border dark:border-agora-dark-border p-4 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-agora-muted" />
          <p className="mt-2 text-sm text-agora-muted">{t('noActiveSession')}</p>
          <button
            onClick={() => { setShowNewSession(true); setShowSessionsSidebar(false); }}
            className="mt-3 text-sm text-agora-primary hover:underline"
          >
            {t('startSession')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3 md:gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
            <HelpTooltip content={tGuide('agora')} />
          </div>
          <p className="text-sm md:text-base text-agora-muted dark:text-agora-dark-muted">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile: Sessions toggle */}
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            onClick={() => setShowSessionsSidebar(true)}
          >
            <PanelLeftOpen className="h-4 w-4 mr-1.5" />
            Sessions
          </Button>
          <button
            onClick={() => setShowNewSession(true)}
            className="flex items-center gap-2 rounded-lg bg-agora-primary px-3 md:px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('startSession')}</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sessions Sidebar - Desktop */}
        <div className="hidden md:block w-72 flex-shrink-0">
          <ScrollArea className="h-full pr-2">
            {sessionsContent}
          </ScrollArea>
        </div>

        {/* Sessions Sidebar - Mobile Sheet */}
        <Sheet open={showSessionsSidebar} onOpenChange={setShowSessionsSidebar}>
          <SheetContent side="left" className="w-80 p-0">
            <SheetHeader className="px-4 py-3 border-b border-agora-border dark:border-agora-dark-border">
              <SheetTitle>Sessions</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-4rem)] p-4">
              {sessionsContent}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col rounded-lg border border-agora-border dark:border-agora-dark-border bg-agora-card dark:bg-agora-dark-card min-w-0">
          {activeSession ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-agora-border dark:border-agora-dark-border p-3 md:p-4 gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-900 dark:text-white text-sm md:text-base truncate">{activeSession.title}</h2>
                  <p className="text-xs text-agora-muted truncate">
                    Session started {activeSession.created_at ? new Date(activeSession.created_at).toLocaleString() : 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={toggleTranslation}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                      showTranslation
                        ? 'bg-agora-primary/20 text-agora-primary'
                        : 'bg-agora-card dark:bg-agora-dark-card text-agora-muted hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={showTranslation ? 'Show original (English)' : 'Show Korean translation'}
                  >
                    <Languages className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{showTranslation ? '한글' : 'EN'}</span>
                  </button>
                  {/* Mobile: Participants toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setShowParticipantsSidebar(true)}
                  >
                    <Users className="h-4 w-4" />
                    <span className="ml-1 text-xs">{parseParticipants(activeSession.summoned_agents).length}</span>
                  </Button>
                  {/* Desktop: Participant count */}
                  <div className="hidden lg:flex items-center gap-2 text-sm text-agora-muted">
                    <Users className="h-4 w-4" />
                    <span>{parseParticipants(activeSession.summoned_agents).length} participants</span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1">
                <div className="p-3 md:p-4 space-y-3 md:space-y-4">
                  {messages.length > 0 ? (
                    messages.map((msg: AgoraMessage) => {
                      const isSystemMessage = msg.message_type === 'system';
                      const isHumanMessage = msg.message_type === 'human';

                      let agentName = 'Agent';
                      let agentColor = '#6366f1';

                      if (isSystemMessage) {
                        agentName = 'System';
                        agentColor = '#64748b';
                      } else if (isHumanMessage) {
                        agentName = msg.human_id || 'User';
                        agentColor = '#10b981';
                      } else if (msg.display_name || msg.agent_name) {
                        agentName = msg.display_name || msg.agent_name || 'Agent';
                        agentColor = msg.color || '#6366f1';
                      }

                      return (
                        <ChatMessage
                          key={msg.id}
                          message={{
                            id: msg.id,
                            agentId: msg.agent_id || msg.human_id || 'system',
                            agentName,
                            agentColor,
                            content: msg.content,
                            timestamp: msg.created_at,
                            tier: msg.tier_used,
                            isSystem: isSystemMessage,
                            isHuman: isHumanMessage,
                          }}
                          onAgentClick={!isSystemMessage && !isHumanMessage && msg.agent_id ? handleAgentClick : undefined}
                          showTranslation={showTranslation}
                        />
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-agora-muted">
                      <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p>No messages yet. Start the discussion!</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input - fixed bottom with iOS safe area */}
              <div className="border-t border-agora-border dark:border-agora-dark-border p-3 md:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('sendMessage')}
                    className="flex-1 rounded-lg border border-agora-border dark:border-agora-dark-border bg-agora-darker dark:bg-agora-dark-darker px-3 md:px-4 py-2 text-sm md:text-base text-slate-900 dark:text-white placeholder-agora-muted focus:border-agora-primary focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSending}
                    aria-label="Send message"
                    className="flex items-center gap-2 rounded-lg bg-agora-primary px-3 md:px-4 py-2 text-slate-900 transition-colors hover:bg-agora-primary/80 disabled:opacity-50 min-w-[44px] justify-center"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-4">
              <MessageSquare className="h-12 md:h-16 w-12 md:w-16 text-agora-muted" />
              <h3 className="mt-4 text-base md:text-lg font-semibold text-slate-900 dark:text-white">
                {t('noActiveSession')}
              </h3>
              <p className="mt-2 text-sm text-agora-muted">
                Select a session or start a new one
              </p>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  className="md:hidden"
                  onClick={() => setShowSessionsSidebar(true)}
                >
                  <PanelLeftOpen className="h-4 w-4 mr-1.5" />
                  Browse Sessions
                </Button>
                <button
                  onClick={() => setShowNewSession(true)}
                  className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-slate-900 transition-colors hover:bg-agora-primary/80"
                >
                  <Plus className="h-4 w-4" />
                  {t('startSession')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Participants Sidebar - Desktop */}
        {activeSession && (
          <div className="hidden lg:block w-64 flex-shrink-0">
            <ParticipantList
              agents={agents || []}
              participants={parseParticipants(activeSession.summoned_agents)}
              onAgentClick={handleAgentClick}
            />
          </div>
        )}

        {/* Participants Sidebar - Mobile Sheet */}
        <Sheet open={showParticipantsSidebar} onOpenChange={setShowParticipantsSidebar}>
          <SheetContent side="right" className="w-80 p-0">
            <SheetHeader className="px-4 py-3 border-b border-agora-border dark:border-agora-dark-border">
              <SheetTitle>Participants</SheetTitle>
            </SheetHeader>
            <div className="p-4">
              {activeSession && (
                <ParticipantList
                  agents={agents || []}
                  participants={parseParticipants(activeSession.summoned_agents)}
                  onAgentClick={(agentId) => { handleAgentClick(agentId); setShowParticipantsSidebar(false); }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Modals */}
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
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          messageCount={getAgentMessageCount(selectedAgent.id)}
        />
      )}
    </div>
  );
}

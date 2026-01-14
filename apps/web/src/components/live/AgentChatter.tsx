'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistanceToNow, isValid } from 'date-fns';
import { TerminalBox, BlinkingCursor } from './TerminalBox';
import { useSocket } from '@/hooks/useSocket';
import { useTranslationToggle } from '@/hooks/useTranslation';
import { TranslatedText } from '@/components/ui/TranslatedText';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

// Helper to safely format timestamp
function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'just now';
  const date = new Date(timestamp);
  if (!isValid(date)) return 'just now';
  return formatDistanceToNow(date, { addSuffix: true });
}

interface ChatterMessage {
  id: string;
  agentId: string;
  agentName: string;
  message: string;
  color: string;
  timestamp: string;
}

interface AgentChatterProps {
  className?: string;
  maxItems?: number;
}

async function fetchRecentChatter(limit: number): Promise<ChatterMessage[]> {
  const res = await fetch(`${API_URL}/api/agents/chatter/recent?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch chatter');
  const data = await res.json();
  // API returns { chatter: [...] }
  return (data.chatter || []).map((c: any) => ({
    id: c.id,
    agentId: c.agent_id,
    agentName: c.display_name || c.agent_name || 'Agent',
    message: c.content,
    color: c.color || '#6366f1',
    timestamp: c.created_at,
  }));
}

export function AgentChatter({ className, maxItems = 10 }: AgentChatterProps) {
  const [messages, setMessages] = useState<ChatterMessage[]>([]);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const { subscribe, isConnected } = useSocket();
  const { showTranslation, toggle: toggleTranslation } = useTranslationToggle();

  // Initial fetch
  const { data: initialMessages } = useQuery({
    queryKey: ['agent-chatter', maxItems],
    queryFn: () => fetchRecentChatter(maxItems),
  });

  // Set initial messages
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Subscribe to real-time chatter
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe('agent:chatter', (data: unknown) => {
      const message = data as ChatterMessage;
      // Show typing indicator briefly
      setTypingAgent(message.agentName);

      setTimeout(() => {
        setMessages((prev) => {
          const newMessages = [message, ...prev].slice(0, maxItems);
          return newMessages;
        });
        setTypingAgent(null);
      }, 1500);
    });

    return unsubscribe;
  }, [isConnected, subscribe, maxItems]);

  return (
    <TerminalBox
      title="AGENT CHATTER"
      className={className}
      headerRight={
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
      }
    >
      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
        {/* Typing indicator */}
        {typingAgent && (
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 animate-pulse">
            <span>[typing...]</span>
            <span className="text-[var(--live-glow)]">{typingAgent}</span>
          </div>
        )}

        {messages.length === 0 && !typingAgent ? (
          <div className="text-center text-[var(--text-muted)] text-xs py-4">
            Agents are thinking...
          </div>
        ) : (
          messages.slice(0, 5).map((msg, index) => (
            <div
              key={msg.id}
              className={clsx(
                'text-xs transition-all duration-300',
                index === 0 && 'animate-fade-in'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="font-medium"
                  style={{ color: msg.color || 'var(--live-glow)' }}
                >
                  [{msg.agentName}]
                </span>
                <span className="text-[var(--text-dim)] text-[10px]">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <p className="text-[var(--text-muted)] leading-relaxed pl-2 border-l border-[var(--live-border)]">
                <TranslatedText
                  text={msg.message}
                  showTranslation={showTranslation}
                  targetLanguage="ko"
                  loadingText="..."
                />
                {index === 0 && <BlinkingCursor className="ml-0.5" />}
              </p>
            </div>
          ))
        )}
      </div>
    </TerminalBox>
  );
}

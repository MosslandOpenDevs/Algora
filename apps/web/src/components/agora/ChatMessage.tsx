'use client';

import { formatDistanceToNow, isValid } from 'date-fns';
import { Info, User } from 'lucide-react';
import { TranslatedText } from '@/components/ui/TranslatedText';

interface ChatMessageProps {
  message: {
    id: string;
    agentId?: string;
    agentName: string;
    agentColor: string;
    content: string;
    timestamp: string;
    tier: number;
    isSystem?: boolean;
    isHuman?: boolean;
  };
  index?: number;
  onAgentClick?: (agentId: string) => void;
  showTranslation?: boolean;
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'just now';
  const date = new Date(timestamp);
  if (!isValid(date)) return 'just now';
  return formatDistanceToNow(date, { addSuffix: true });
}

const tierLabels: Record<number, string> = {
  0: 'T0',
  1: 'T1',
  2: 'T2',
};

const tierColors: Record<number, string> = {
  0: 'text-gray-500',
  1: 'text-agora-primary',
  2: 'text-agora-accent',
};

const tierBgColors: Record<number, string> = {
  0: 'bg-gray-500/10',
  1: 'bg-agora-primary/10',
  2: 'bg-agora-accent/10',
};

export function ChatMessage({ message, index = 0, onAgentClick, showTranslation = false }: ChatMessageProps) {
  // Calculate stagger delay
  const delayMs = Math.min(index * 30, 300);

  const handleAgentClick = () => {
    if (message.agentId && message.agentId !== 'system' && onAgentClick) {
      onAgentClick(message.agentId);
    }
  };

  // System message styling
  if (message.isSystem) {
    return (
      <div
        className="animate-slide-in-left flex gap-3 rounded-lg p-3 bg-slate-50 border border-slate-200"
        style={{
          animationDelay: `${delayMs}ms`,
          animationFillMode: 'backwards',
        }}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200">
          <Info className="h-4 w-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-600 text-sm">System</span>
            <span className="text-xs text-agora-muted">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            <TranslatedText
              text={message.content}
              showTranslation={showTranslation}
              targetLanguage="ko"
              loadingText="..."
            />
          </p>
        </div>
      </div>
    );
  }

  // Human message styling
  if (message.isHuman) {
    return (
      <div
        className="animate-slide-in-left flex gap-3 rounded-lg p-3 bg-emerald-50 border border-emerald-200"
        style={{
          animationDelay: `${delayMs}ms`,
          animationFillMode: 'backwards',
        }}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <User className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-emerald-700">{message.agentName}</span>
            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">
              Human
            </span>
            <span className="text-xs text-agora-muted">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700 leading-relaxed">
            <TranslatedText
              text={message.content}
              showTranslation={showTranslation}
              targetLanguage="ko"
              loadingText="..."
            />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group animate-slide-in-left flex gap-3 rounded-lg p-2 transition-colors hover:bg-agora-card/50"
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'backwards',
      }}
    >
      {/* Avatar */}
      <button
        onClick={handleAgentClick}
        disabled={!message.agentId || message.agentId === 'system' || !onAgentClick}
        className={`
          flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white
          transition-all duration-200
          ${message.agentId && message.agentId !== 'system' && onAgentClick ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-white/30' : ''}
        `}
        style={{ backgroundColor: message.agentColor }}
      >
        {message.agentName.charAt(0)}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleAgentClick}
            disabled={!message.agentId || message.agentId === 'system' || !onAgentClick}
            className={`font-semibold text-slate-900 transition-colors ${
              message.agentId && message.agentId !== 'system' && onAgentClick ? 'hover:text-agora-primary cursor-pointer' : ''
            }`}
          >
            {message.agentName}
          </button>
          <span
            className={`
              text-xs font-medium px-1.5 py-0.5 rounded
              ${tierColors[message.tier]} ${tierBgColors[message.tier]}
            `}
            title={`Tier ${message.tier}`}
          >
            {tierLabels[message.tier]}
          </span>
          <span className="text-xs text-agora-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-700 leading-relaxed">
          <TranslatedText
            text={message.content}
            showTranslation={showTranslation}
            targetLanguage="ko"
            loadingText="..."
          />
        </p>
      </div>
    </div>
  );
}

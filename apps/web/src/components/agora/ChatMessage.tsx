'use client';

import { formatDistanceToNow } from 'date-fns';

interface ChatMessageProps {
  message: {
    id: string;
    agentId?: string;
    agentName: string;
    agentColor: string;
    content: string;
    timestamp: string;
    tier: number;
  };
  index?: number;
  onAgentClick?: (agentId: string) => void;
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

export function ChatMessage({ message, index = 0, onAgentClick }: ChatMessageProps) {
  // Calculate stagger delay
  const delayMs = Math.min(index * 30, 300);

  const handleAgentClick = () => {
    if (message.agentId && onAgentClick) {
      onAgentClick(message.agentId);
    }
  };

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
        disabled={!message.agentId || !onAgentClick}
        className={`
          flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white
          transition-all duration-200
          ${message.agentId && onAgentClick ? 'cursor-pointer hover:scale-110 hover:ring-2 hover:ring-white/30' : ''}
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
            disabled={!message.agentId || !onAgentClick}
            className={`font-semibold text-slate-900 transition-colors ${
              message.agentId && onAgentClick ? 'hover:text-agora-primary cursor-pointer' : ''
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
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-700 leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}

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

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: message.agentColor }}
      >
        {message.agentName.charAt(0)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{message.agentName}</span>
          <span className={`text-xs font-medium ${tierColors[message.tier]}`}>
            {tierLabels[message.tier]}
          </span>
          <span className="text-xs text-agora-muted">
            {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-300 leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}

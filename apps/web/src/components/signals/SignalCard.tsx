'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  Rss,
  Github,
  Database,
  Link2,
  Radio,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface Signal {
  id: string;
  source: 'rss' | 'github' | 'blockchain' | 'api' | 'manual';
  title: string;
  content: string;
  url?: string;
  processed: boolean;
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface SignalCardProps {
  signal: Signal;
}

const sourceIcons: Record<string, React.ReactNode> = {
  rss: <Rss className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  blockchain: <Database className="h-4 w-4" />,
  api: <Link2 className="h-4 w-4" />,
  manual: <Radio className="h-4 w-4" />,
};

const sourceColors: Record<string, string> = {
  rss: 'text-orange-500 bg-orange-500/10',
  github: 'text-gray-400 bg-gray-500/10',
  blockchain: 'text-blue-500 bg-blue-500/10',
  api: 'text-purple-500 bg-purple-500/10',
  manual: 'text-green-500 bg-green-500/10',
};

const priorityConfig = {
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', icon: null },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', icon: Clock },
  high: { color: 'text-agora-error', bg: 'bg-agora-error/10', icon: AlertTriangle },
};

export function SignalCard({ signal }: SignalCardProps) {
  const t = useTranslations('Signals');
  const PriorityIcon = priorityConfig[signal.priority].icon;

  return (
    <div
      className={`rounded-lg border bg-agora-card p-4 transition-colors hover:border-agora-primary/50 ${
        signal.processed ? 'border-agora-border' : 'border-agora-warning/30'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Source Icon */}
        <div className={`rounded-lg p-2 ${sourceColors[signal.source]}`}>
          {sourceIcons[signal.source]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white">{signal.title}</h3>
              <p className="mt-1 text-sm text-agora-muted line-clamp-2">
                {signal.content}
              </p>
            </div>

            {/* Priority Badge */}
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${priorityConfig[signal.priority].bg} ${priorityConfig[signal.priority].color}`}
            >
              {PriorityIcon && <PriorityIcon className="h-3 w-3" />}
              <span>{t(`priority.${signal.priority}`)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            {/* Source */}
            <span className={`flex items-center gap-1 ${sourceColors[signal.source].split(' ')[0]}`}>
              {sourceIcons[signal.source]}
              {t(`sources.${signal.source}`)}
            </span>

            {/* Status */}
            <span
              className={`flex items-center gap-1 ${
                signal.processed ? 'text-agora-success' : 'text-agora-warning'
              }`}
            >
              {signal.processed ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  {t('status.processed')}
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  {t('status.pending')}
                </>
              )}
            </span>

            {/* Timestamp */}
            <span className="text-agora-muted">
              {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
            </span>

            {/* External Link */}
            {signal.url && (
              <a
                href={signal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-agora-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t('viewSource')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

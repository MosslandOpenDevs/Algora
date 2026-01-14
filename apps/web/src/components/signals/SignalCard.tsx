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
  Clock,
  AlertTriangle,
  ChevronRight,
  MessageCircle,
} from 'lucide-react';
import type { Signal } from '@/lib/api';

interface SignalCardProps {
  signal: Signal;
  index?: number;
  onClick?: () => void;
}

// Helper to extract source type from source string (e.g., "rss:Cointelegraph" -> "rss")
function getSourceType(source: string): string {
  const type = source.split(':')[0].toLowerCase();
  if (['rss', 'github', 'blockchain', 'social', 'api', 'manual'].includes(type)) {
    return type;
  }
  return 'api';
}

// Helper to get title from description or metadata
function getTitle(signal: Signal): string {
  if (signal.metadata) {
    try {
      const meta = typeof signal.metadata === 'string' ? JSON.parse(signal.metadata) : signal.metadata;
      if (meta.title) return meta.title;
    } catch {
      // Ignore parse errors
    }
  }
  // Use first line of description as title
  const firstLine = signal.description?.split('\n')[0] || 'Signal';
  return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
}

// Helper to get URL from metadata
function getUrl(signal: Signal): string | undefined {
  if (signal.metadata) {
    try {
      const meta = typeof signal.metadata === 'string' ? JSON.parse(signal.metadata) : signal.metadata;
      return meta.link || meta.url;
    } catch {
      // Ignore parse errors
    }
  }
  return undefined;
}

const sourceIcons: Record<string, React.ReactNode> = {
  rss: <Rss className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  blockchain: <Database className="h-4 w-4" />,
  social: <MessageCircle className="h-4 w-4" />,
  api: <Link2 className="h-4 w-4" />,
  manual: <Radio className="h-4 w-4" />,
};

const sourceColors: Record<string, string> = {
  rss: 'text-orange-500 bg-orange-500/10',
  github: 'text-gray-400 bg-gray-500/10',
  blockchain: 'text-blue-500 bg-blue-500/10',
  social: 'text-pink-500 bg-pink-500/10',
  api: 'text-purple-500 bg-purple-500/10',
  manual: 'text-green-500 bg-green-500/10',
};

const severityConfig: Record<string, { color: string; bg: string; icon: typeof Clock | null }> = {
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', icon: null },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', icon: Clock },
  high: { color: 'text-agora-error', bg: 'bg-agora-error/10', icon: AlertTriangle },
  critical: { color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertTriangle },
};

export function SignalCard({ signal, index = 0, onClick }: SignalCardProps) {
  const t = useTranslations('Signals');
  const sourceType = getSourceType(signal.source);
  const title = getTitle(signal);
  const url = getUrl(signal);
  const severity = signal.severity || 'low';
  const config = severityConfig[severity] || severityConfig.low;
  const SeverityIcon = config.icon;

  // Check if signal is recent (within last hour)
  const signalTime = new Date(signal.timestamp || signal.created_at).getTime();
  const isRecent = Date.now() - signalTime < 60 * 60 * 1000;

  // Calculate stagger delay
  const delayMs = Math.min(index * 50, 400);

  const isHighSeverity = severity === 'high' || severity === 'critical';

  return (
    <div
      onClick={onClick}
      className={`
        relative group rounded-lg border bg-agora-card p-4
        animate-slide-up
        transition-all duration-300
        hover:border-agora-primary/50 hover:scale-[1.02] hover:shadow-lg hover:shadow-agora-primary/10
        ${isHighSeverity ? 'border-agora-warning/50 ring-2 ring-agora-warning/30' : 'border-agora-border'}
        ${onClick ? 'cursor-pointer' : ''}
      `}
      style={{
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'backwards',
      }}
    >
      {/* NEW Badge */}
      {isRecent && (
        <span className="absolute -top-2 -right-2 rounded-full bg-agora-primary px-2 py-0.5 text-[10px] font-bold text-slate-900 animate-bounce-in">
          NEW
        </span>
      )}

      <div className="flex items-start gap-4">
        {/* Source Icon */}
        <div
          className={`
            rounded-lg p-2 transition-all duration-300
            group-hover:scale-110 group-hover:rotate-6
            ${sourceColors[sourceType] || sourceColors.api}
          `}
        >
          {sourceIcons[sourceType] || sourceIcons.api}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Click indicator */}
          {onClick && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-agora-muted opacity-0 transition-opacity group-hover:opacity-100">
              <ChevronRight className="h-5 w-5" />
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-agora-muted line-clamp-2">
                {signal.description}
              </p>
            </div>

            {/* Severity Badge */}
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
            >
              {SeverityIcon && <SeverityIcon className="h-3 w-3" />}
              <span>{t(`priority.${severity === 'critical' ? 'high' : severity}`)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            {/* Source */}
            <span className={`flex items-center gap-1 ${(sourceColors[sourceType] || sourceColors.api).split(' ')[0]}`}>
              {sourceIcons[sourceType] || sourceIcons.api}
              {signal.source.split(':')[1] || t(`sources.${sourceType}`)}
            </span>

            {/* Category */}
            <span className="text-agora-muted">
              {signal.category}
            </span>

            {/* Timestamp */}
            <span className="text-agora-muted">
              {formatDistanceToNow(new Date(signal.timestamp || signal.created_at), { addSuffix: true })}
            </span>

            {/* External Link */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
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

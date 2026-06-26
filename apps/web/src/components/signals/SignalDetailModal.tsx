'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  Rss,
  Github,
  Database,
  Link2,
  Radio,
  ExternalLink,
  Clock,
  AlertTriangle,
  Calendar,
  Tag,
  FileText,
  ArrowRight,
} from 'lucide-react';
import type { Signal } from '@/lib/api';
import { safeFormatDate } from '@/lib/utils';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface SignalDetailModalProps {
  signal: Signal;
  onClose: () => void;
}

// Helper to extract source type from source string
function getSourceType(source: string): string {
  const type = source.split(':')[0].toLowerCase();
  if (['rss', 'github', 'blockchain', 'api', 'manual'].includes(type)) {
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

// Helper to parse metadata
function parseMetadata(signal: Signal): Record<string, unknown> | null {
  if (!signal.metadata) return null;
  try {
    return typeof signal.metadata === 'string' ? JSON.parse(signal.metadata) : signal.metadata;
  } catch {
    return null;
  }
}

const sourceIcons: Record<string, React.ReactNode> = {
  rss: <Rss className="h-5 w-5" />,
  github: <Github className="h-5 w-5" />,
  blockchain: <Database className="h-5 w-5" />,
  api: <Link2 className="h-5 w-5" />,
  manual: <Radio className="h-5 w-5" />,
};

const sourceColors: Record<string, string> = {
  rss: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  github: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  blockchain: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
  api: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
  manual: 'text-green-500 bg-green-500/10 border-green-500/30',
};

const severityConfig: Record<string, { color: string; bg: string; border: string; icon: typeof Clock | null }> = {
  low: { color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: null },
  medium: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', border: 'border-agora-warning/30', icon: Clock },
  high: { color: 'text-agora-error', bg: 'bg-agora-error/10', border: 'border-agora-error/30', icon: AlertTriangle },
  critical: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle },
};

export function SignalDetailModal({ signal, onClose }: SignalDetailModalProps) {
  const t = useTranslations('Signals');
  const [mounted, setMounted] = useState(false);
  const sourceType = getSourceType(signal.source);
  const title = getTitle(signal);
  const url = getUrl(signal);
  const metadata = parseMetadata(signal);
  const severity = signal.severity || 'low';
  const config = severityConfig[severity] || severityConfig.low;
  const SeverityIcon = config.icon;
  const { dialogProps, titleProps } = useDialogA11y({ onClose });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        {...dialogProps}
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up"
      >
          {/* Header */}
          <div
            className="animate-slide-up flex items-start justify-between border-b border-agora-border p-4 sm:p-6 flex-shrink-0"
            style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
          >
            <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
              <div
                className={`
                  rounded-lg border p-2 sm:p-3 transition-transform duration-300 hover:scale-110 hover:rotate-6 flex-shrink-0
                  ${sourceColors[sourceType] || sourceColors.api}
                `}
              >
                {sourceIcons[sourceType] || sourceIcons.api}
              </div>
              <div className="min-w-0 flex-1">
                <h2 {...titleProps} className="text-lg sm:text-xl font-bold text-agora-text pr-8 line-clamp-2 break-words">{title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {/* Source Badge */}
                  <span className={`flex items-center gap-1.5 text-sm ${(sourceColors[sourceType] || sourceColors.api).split(' ')[0]}`}>
                    {sourceIcons[sourceType] || sourceIcons.api}
                    {signal.source.split(':')[1] || t(`sources.${sourceType}`)}
                  </span>

                  {/* Severity Badge */}
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
                  >
                    {SeverityIcon && <SeverityIcon className="h-3 w-3" />}
                    {t(`priority.${severity === 'critical' ? 'high' : severity}`)}
                  </span>

                  {/* Category Badge */}
                  <span className="rounded-full bg-agora-card px-2.5 py-0.5 text-xs font-medium text-agora-muted">
                    {signal.category}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-agora-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
            {/* Main Content */}
            <div
              className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4"
              style={{ animationDelay: '50ms', animationFillMode: 'backwards' }}
            >
              <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                <FileText className="h-4 w-4" />
                <span>{t('detail.content')}</span>
              </div>
              <p className="text-agora-text whitespace-pre-wrap leading-relaxed break-words overflow-hidden">
                {signal.description}
              </p>
            </div>

            {/* Metadata */}
            <div
              className="animate-slide-up mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
              style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}
            >
              {/* Timestamp */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Calendar className="h-4 w-4" />
                  <span>{t('detail.timestamp')}</span>
                </div>
                <p className="text-agora-text font-medium">
                  {safeFormatDate(signal.timestamp || signal.created_at, (d) => format(d, 'PPpp'))}
                </p>
                <p className="text-sm text-agora-muted mt-1">
                  {safeFormatDate(signal.timestamp || signal.created_at, (d) => formatDistanceToNow(d, { addSuffix: true }))}
                </p>
              </div>

              {/* Signal ID */}
              <div className="rounded-lg border border-agora-border bg-agora-card p-4 transition-all hover:border-agora-primary/30">
                <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                  <Tag className="h-4 w-4" />
                  <span>{t('detail.signalId')}</span>
                </div>
                <p className="text-agora-text font-mono text-sm break-all">
                  {signal.id}
                </p>
              </div>
            </div>

            {/* Additional Metadata */}
            {metadata && Object.keys(metadata).length > 0 && (
              <div
                className="animate-slide-up mt-4 rounded-lg border border-agora-border bg-agora-card p-4"
                style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
              >
                <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                  <Database className="h-4 w-4" />
                  <span>{t('detail.metadata')}</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-sm">
                      <span className="text-agora-muted sm:min-w-[100px] flex-shrink-0">{key}:</span>
                      <span className="text-agora-text font-mono break-all overflow-hidden text-ellipsis">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="animate-slide-up flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-agora-border p-4 flex-shrink-0"
            style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
          >
            <div className="text-xs sm:text-sm text-agora-muted truncate">
              {t('detail.source')}: {signal.source}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-agora-text transition-all duration-200 hover:bg-agora-border hover:scale-105"
                >
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{t('viewSource')}</span>
                </a>
              )}

              <button className="flex items-center justify-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all duration-200 hover:bg-agora-primary/80 hover:scale-105 hover:shadow-lg hover:shadow-agora-primary/30">
                <ArrowRight className="h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-1" />
                <span className="truncate">{t('detail.createIssue')}</span>
              </button>
            </div>
          </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

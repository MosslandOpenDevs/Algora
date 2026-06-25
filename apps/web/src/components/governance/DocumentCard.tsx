'use client';

import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Archive,
  Send,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { type GovernanceDocument, type DocumentState } from '@/lib/api';
import { safeFormatDate } from '@/lib/utils';

interface DocumentCardProps {
  document: GovernanceDocument;
  onClick?: () => void;
  index?: number;
}

const stateIcons: Record<DocumentState, React.ElementType> = {
  draft: FileText,
  pending_review: Clock,
  in_review: Eye,
  approved: CheckCircle,
  published: Send,
  superseded: Archive,
  archived: Archive,
  rejected: XCircle,
};

const stateColors: Record<DocumentState, string> = {
  draft: 'text-agora-muted bg-agora-muted/10',
  pending_review: 'text-agora-warning bg-agora-warning/10',
  in_review: 'text-agora-primary bg-agora-primary/10',
  approved: 'text-agora-success bg-agora-success/10',
  published: 'text-agora-accent bg-agora-accent/10',
  superseded: 'text-slate-500 bg-slate-500/10',
  archived: 'text-slate-400 bg-slate-400/10',
  rejected: 'text-agora-error bg-agora-error/10',
};

const documentTypeLabels: Record<string, string> = {
  DP: 'Decision Packet',
  GP: 'Governance Proposal',
  RM: 'Resolution Memo',
  RC: 'Reconciliation Memo',
  WGC: 'WG Charter',
  WGR: 'WG Report',
  ER: 'Ecosystem Report',
  PP: 'Partnership Proposal',
  PA: 'Partnership Agreement',
  DGP: 'Grant Proposal',
  DG: 'Developer Grant',
  MR: 'Milestone Report',
  RR: 'Retroactive Reward',
  DR: 'Disclosure Report',
  AR: 'Audit Report',
  RD: 'Research Digest',
  TA: 'Tech Assessment',
};

export function DocumentCard({ document, onClick, index = 0 }: DocumentCardProps) {
  const t = useTranslations('Governance.documents');
  const StateIcon = stateIcons[document.state] || FileText;
  const stateColor = stateColors[document.state] || 'text-agora-muted bg-agora-muted/10';
  const typeLabel = documentTypeLabels[document.type] || document.type;

  return (
    <div
      className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-agora-border px-2 py-0.5 text-xs font-mono text-slate-700">
              {document.type}
            </span>
            <span className="text-xs text-agora-muted">{typeLabel}</span>
          </div>

          {/* Title */}
          <h3 className="font-semibold text-agora-text line-clamp-1">{document.title}</h3>

          {/* Summary */}
          <p className="mt-1 text-sm text-agora-muted line-clamp-2">{document.summary}</p>

          {/* Meta */}
          <div className="mt-3 flex items-center gap-4 text-xs text-agora-muted">
            <span>v{document.version.major}.{document.version.minor}.{document.version.patch}</span>
            <span>
              {safeFormatDate(document.updatedAt, (d) => formatDistanceToNow(d, { addSuffix: true }))}
            </span>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col items-end gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${stateColor}`}>
            <StateIcon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium capitalize">
              {t(`states.${document.state}`)}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-agora-muted" />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  X,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Archive,
  Send,
  Eye,
  User,
  Hash,
  Calendar,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { type GovernanceDocument, type DocumentState } from '@/lib/api';

interface DocumentDetailModalProps {
  document: GovernanceDocument;
  isOpen: boolean;
  onClose: () => void;
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

const documentTypeLabels: Record<string, { name: string; description: string }> = {
  DP: { name: 'Decision Packet', description: 'Comprehensive analysis and recommendations for governance decisions' },
  GP: { name: 'Governance Proposal', description: 'Formal proposal for community voting' },
  RM: { name: 'Resolution Memo', description: 'Documentation of resolved issues' },
  RC: { name: 'Reconciliation Memo', description: 'Dispute resolution documentation' },
  WGC: { name: 'WG Charter', description: 'Working Group formation charter' },
  WGR: { name: 'WG Report', description: 'Working Group periodic report' },
  ER: { name: 'Ecosystem Report', description: 'Ecosystem health and metrics report' },
  PP: { name: 'Partnership Proposal', description: 'Partnership opportunity proposal' },
  PA: { name: 'Partnership Agreement', description: 'Executed partnership agreement' },
  DGP: { name: 'Grant Proposal', description: 'Developer grant application' },
  DG: { name: 'Developer Grant', description: 'Approved developer grant' },
  MR: { name: 'Milestone Report', description: 'Project milestone progress report' },
  RR: { name: 'Retroactive Reward', description: 'Retroactive contribution reward' },
  DR: { name: 'Disclosure Report', description: 'Transparency and disclosure report' },
  AR: { name: 'Audit Report', description: 'Security or financial audit report' },
  RD: { name: 'Research Digest', description: 'Research findings summary' },
  TA: { name: 'Tech Assessment', description: 'Technical evaluation report' },
};

export function DocumentDetailModal({ document, isOpen, onClose }: DocumentDetailModalProps) {
  const t = useTranslations('Governance.documents');
  const [mounted, setMounted] = useState(false);
  const StateIcon = stateIcons[document.state] || FileText;
  const stateColor = stateColors[document.state] || 'text-agora-muted bg-agora-muted/10';
  const typeInfo = documentTypeLabels[document.type] || { name: document.type, description: '' };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-card shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-agora-border bg-agora-card p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-agora-dark px-3 py-1 text-sm font-mono text-slate-700">
                {document.type}
              </span>
              <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${stateColor}`}>
                <StateIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium capitalize">
                  {t(`states.${document.state}`)}
                </span>
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{document.title}</h2>
            <p className="text-sm text-agora-muted mt-1">{typeInfo.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {/* Summary */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('summary')}</h3>
            <p className="text-sm text-agora-muted leading-relaxed">{document.summary}</p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg bg-agora-dark/50 p-4">
              <div className="flex items-center gap-2 text-agora-muted mb-1">
                <Hash className="h-4 w-4" />
                <span className="text-xs font-medium">{t('documentId')}</span>
              </div>
              <p className="text-sm font-mono text-slate-900">{document.id}</p>
            </div>

            <div className="rounded-lg bg-agora-dark/50 p-4">
              <div className="flex items-center gap-2 text-agora-muted mb-1">
                <Tag className="h-4 w-4" />
                <span className="text-xs font-medium">{t('version')}</span>
              </div>
              <p className="text-sm font-mono text-slate-900">
                v{document.version.major}.{document.version.minor}.{document.version.patch}
              </p>
            </div>

            <div className="rounded-lg bg-agora-dark/50 p-4">
              <div className="flex items-center gap-2 text-agora-muted mb-1">
                <User className="h-4 w-4" />
                <span className="text-xs font-medium">{t('createdBy')}</span>
              </div>
              <p className="text-sm text-slate-900">{document.createdBy}</p>
            </div>

            <div className="rounded-lg bg-agora-dark/50 p-4">
              <div className="flex items-center gap-2 text-agora-muted mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">{t('createdAt')}</span>
              </div>
              <p className="text-sm text-slate-900">
                {format(new Date(document.createdAt), 'PPP')}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('timeline')}</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-agora-success/10">
                  <FileText className="h-4 w-4 text-agora-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('created')}</p>
                  <p className="text-xs text-agora-muted">
                    {formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-agora-primary/10">
                  <Clock className="h-4 w-4 text-agora-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('lastUpdated')}</p>
                  <p className="text-xs text-agora-muted">
                    {formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content Hash */}
          <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-agora-muted mb-1">{t('contentHash')}</p>
                <p className="text-xs font-mono text-slate-700 break-all">{document.contentHash}</p>
              </div>
              <CheckCircle className="h-5 w-5 text-agora-success shrink-0" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-agora-border bg-agora-card p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            {t('close')}
          </button>
          {document.issueId && (
            <button className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-all hover:bg-agora-primary/80">
              <ExternalLink className="h-4 w-4" />
              {t('viewIssue')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, globalThis.document.body);
}

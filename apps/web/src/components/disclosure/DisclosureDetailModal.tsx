'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Download,
  Share2,
  Shield,
  AlertTriangle,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import type { DisclosureReportType, DisclosureReportStatus } from '@/lib/api';

interface DisclosureReport {
  id: string;
  title: string;
  type: DisclosureReportType;
  status: DisclosureReportStatus;
  date: string;
  summary: string;
  content?: string;
  file_url?: string;
  author: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

interface DisclosureDetailModalProps {
  report: DisclosureReport;
  onClose: () => void;
  onDownload?: (report: DisclosureReport) => void;
}

const typeConfig: Record<DisclosureReportType, {
  icon: typeof FileText;
  color: string;
  bg: string;
  border: string;
  label: string;
  description: string;
}> = {
  quarterly: {
    icon: Calendar,
    color: 'text-agora-primary',
    bg: 'bg-agora-primary/10',
    border: 'border-agora-primary/30',
    label: 'Quarterly Report',
    description: 'Regular quarterly governance and operational report',
  },
  annual: {
    icon: BookOpen,
    color: 'text-agora-accent',
    bg: 'bg-agora-accent/10',
    border: 'border-agora-accent/30',
    label: 'Annual Report',
    description: 'Comprehensive annual transparency and governance report',
  },
  incident: {
    icon: AlertTriangle,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
    border: 'border-agora-warning/30',
    label: 'Incident Report',
    description: 'Security incident analysis and response documentation',
  },
  audit: {
    icon: Shield,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    border: 'border-agora-success/30',
    label: 'Audit Report',
    description: 'Third-party security and smart contract audit results',
  },
};

const statusConfig: Record<DisclosureReportStatus, {
  icon: typeof CheckCircle;
  color: string;
  bg: string;
  label: string;
}> = {
  published: {
    icon: CheckCircle,
    color: 'text-agora-success',
    bg: 'bg-agora-success/10',
    label: 'Published',
  },
  pending: {
    icon: Clock,
    color: 'text-agora-warning',
    bg: 'bg-agora-warning/10',
    label: 'Pending Review',
  },
  draft: {
    icon: AlertCircle,
    color: 'text-agora-muted',
    bg: 'bg-gray-500/10',
    label: 'Draft',
  },
};

// Custom components for markdown rendering
const MarkdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-4 pb-2 border-b border-agora-border">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-slate-900 mt-5 mb-3 pb-1 border-b border-agora-border/50">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-base font-semibold text-slate-900 mt-3 mb-2">
      {children}
    </h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-slate-700 leading-relaxed mb-3">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1 mb-3 text-slate-700">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside space-y-1 mb-3 text-slate-700">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-slate-700">
      {children}
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-900">
      {children}
    </strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-slate-600">
      {children}
    </em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-4 border-agora-primary pl-4 my-3 text-slate-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-agora-card px-1.5 py-0.5 rounded text-sm font-mono text-agora-primary">
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-agora-card p-4 rounded-lg text-sm font-mono overflow-x-auto my-3">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-agora-card p-4 rounded-lg overflow-x-auto my-3 text-sm">
      {children}
    </pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full border-collapse border border-agora-border rounded-lg">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-agora-card">
      {children}
    </thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-agora-border">
      {children}
    </tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-agora-card/50 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left text-sm font-semibold text-slate-900 border-b border-agora-border">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 text-sm text-slate-700 border-b border-agora-border/50">
      {children}
    </td>
  ),
  hr: () => (
    <hr className="my-6 border-agora-border" />
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-agora-primary hover:text-agora-primary/80 underline"
    >
      {children}
    </a>
  ),
};

export function DisclosureDetailModal({ report, onClose, onDownload }: DisclosureDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const type = typeConfig[report.type];
  const status = statusConfig[report.status];
  const TypeIcon = type.icon;
  const StatusIcon = status.icon;

  // Check if content is markdown (starts with # or contains markdown patterns)
  const isMarkdownContent = report.content && (
    report.content.startsWith('#') ||
    report.content.includes('## ') ||
    report.content.includes('| ') ||
    report.content.includes('---')
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDownload = () => {
    if (onDownload) {
      onDownload(report);
    } else if (report.file_url) {
      window.open(report.file_url, '_blank');
    } else {
      // Generate a simple text file with the report content
      const content = `
${report.title}
${'='.repeat(report.title.length)}

Type: ${type.label}
Status: ${status.label}
Date: ${format(new Date(report.date), 'PPP')}
Author: ${report.author}

Summary
-------
${report.summary}

${report.content ? `Content\n-------\n${report.content}` : ''}

---
Generated from Algora Governance Platform
Report ID: ${report.id}
      `.trim();

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.id}-${report.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: report.title,
      text: report.summary,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(`${report.title}\n\n${report.summary}\n\n${window.location.href}`);
      alert('Link copied to clipboard!');
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-agora-border p-6">
            <div className="flex items-start gap-4">
              <div className={`rounded-lg border p-3 ${type.bg} ${type.border}`}>
                <TypeIcon className={`h-5 w-5 ${type.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${type.bg} ${type.color}`}>
                    {type.label}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.color}`}>
                    <StatusIcon className="inline h-3 w-3 mr-1" />
                    {status.label}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 pr-8">{report.title}</h2>
                <div className="mt-2 flex items-center gap-3 text-sm text-agora-muted">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {report.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(report.date), 'PPP')}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-2 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* If we have markdown content, render it */}
            {isMarkdownContent && report.content ? (
              <div className="prose prose-slate max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={MarkdownComponents}
                >
                  {report.content}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                {/* Report Type Description */}
                <div className={`rounded-lg border p-4 mb-4 ${type.bg} ${type.border}`}>
                  <p className={`text-sm ${type.color}`}>
                    {type.description}
                  </p>
                </div>

                {/* Summary */}
                <div className="rounded-lg border border-agora-border bg-agora-card p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                    <FileText className="h-4 w-4" />
                    <span>Summary</span>
                  </div>
                  <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {report.summary}
                  </p>
                </div>

                {/* Full Content (if available and not markdown) */}
                {report.content && (
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3 text-sm text-agora-muted">
                      <BookOpen className="h-4 w-4" />
                      <span>Full Report Content</span>
                    </div>
                    <div className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                      {report.content}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Report Date */}
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                    <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                      <Calendar className="h-4 w-4" />
                      <span>Report Date</span>
                    </div>
                    <p className="text-slate-900 font-medium">
                      {format(new Date(report.date), 'PPP')}
                    </p>
                    <p className="text-sm text-agora-muted mt-1">
                      {formatDistanceToNow(new Date(report.date), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Published Date */}
                  <div className="rounded-lg border border-agora-border bg-agora-card p-4">
                    <div className="flex items-center gap-2 mb-2 text-sm text-agora-muted">
                      <Clock className="h-4 w-4" />
                      <span>{report.published_at ? 'Published' : 'Created'}</span>
                    </div>
                    <p className="text-slate-900 font-medium">
                      {format(new Date(report.published_at || report.created_at), 'PPP')}
                    </p>
                    <p className="text-sm text-agora-muted mt-1">
                      {formatDistanceToNow(new Date(report.published_at || report.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Status Info */}
            {report.status === 'pending' && (
              <div className="mt-4 rounded-lg border border-agora-warning/30 bg-agora-warning/5 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-agora-warning" />
                  <span className="font-medium text-slate-900">Pending Review</span>
                </div>
                <p className="mt-2 text-sm text-agora-muted">
                  This report is currently under review and will be published once approved.
                </p>
              </div>
            )}

            {report.status === 'draft' && (
              <div className="mt-4 rounded-lg border border-gray-500/30 bg-gray-500/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-slate-900">Draft</span>
                </div>
                <p className="mt-2 text-sm text-agora-muted">
                  This report is still being prepared and has not been submitted for review.
                </p>
              </div>
            )}

            {/* External Link */}
            {report.file_url && (
              <div className="mt-4 rounded-lg border border-agora-primary/30 bg-agora-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5 text-agora-primary" />
                    <span className="font-medium text-slate-900">External Document</span>
                  </div>
                  <a
                    href={report.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-agora-primary hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-agora-border p-4">
            <div className="flex items-center gap-2 text-sm text-agora-muted">
              <span className="font-mono">{report.id.slice(0, 8)}...</span>
              <span>•</span>
              <span>Last updated {formatDistanceToNow(new Date(report.updated_at), { addSuffix: true })}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                className="flex items-center gap-2 rounded-lg bg-agora-card px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>

              {report.status === 'published' && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              )}
            </div>
          </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

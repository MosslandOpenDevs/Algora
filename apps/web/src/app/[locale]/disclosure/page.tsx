'use client';

import { useTranslations } from 'next-intl';
import {
  Shield,
  FileText,
  Calendar,
  Download,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

import { HelpTooltip } from '@/components/guide/HelpTooltip';

interface DisclosureReport {
  id: string;
  title: string;
  type: 'quarterly' | 'annual' | 'incident' | 'audit';
  status: 'published' | 'pending' | 'draft';
  date: string;
  summary: string;
}

const mockReports: DisclosureReport[] = [
  {
    id: '1',
    title: 'Q4 2025 Governance Report',
    type: 'quarterly',
    status: 'published',
    date: '2026-01-01',
    summary: 'Comprehensive overview of governance activities, proposals passed, and treasury allocations for Q4 2025.',
  },
  {
    id: '2',
    title: '2025 Annual Transparency Report',
    type: 'annual',
    status: 'published',
    date: '2025-12-31',
    summary: 'Full year summary of DAO operations, including agent activity, signal analysis, and proposal outcomes.',
  },
  {
    id: '3',
    title: 'Security Incident Report - Jan 2026',
    type: 'incident',
    status: 'published',
    date: '2026-01-08',
    summary: 'Detailed analysis of detected security signals and response actions taken by the governance system.',
  },
  {
    id: '4',
    title: 'Smart Contract Audit Report',
    type: 'audit',
    status: 'published',
    date: '2025-11-15',
    summary: 'Third-party audit results for MOC token and governance contracts.',
  },
  {
    id: '5',
    title: 'Q1 2026 Governance Report',
    type: 'quarterly',
    status: 'pending',
    date: '2026-04-01',
    summary: 'Upcoming quarterly report for Q1 2026 governance activities.',
  },
];

const typeConfig = {
  quarterly: { color: 'text-agora-primary', bg: 'bg-agora-primary/10', label: 'Quarterly' },
  annual: { color: 'text-agora-accent', bg: 'bg-agora-accent/10', label: 'Annual' },
  incident: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', label: 'Incident' },
  audit: { color: 'text-agora-success', bg: 'bg-agora-success/10', label: 'Audit' },
};

const statusConfig = {
  published: { icon: CheckCircle, color: 'text-agora-success', label: 'Published' },
  pending: { icon: Clock, color: 'text-agora-warning', label: 'Pending' },
  draft: { icon: AlertCircle, color: 'text-agora-muted', label: 'Draft' },
};

export default function DisclosurePage() {
  const t = useTranslations('Navigation');

  const stats = {
    total: mockReports.length,
    published: mockReports.filter((r) => r.status === 'published').length,
    quarterly: mockReports.filter((r) => r.type === 'quarterly').length,
    audits: mockReports.filter((r) => r.type === 'audit').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{t('disclosure')}</h1>
            <HelpTooltip content="Transparency reports and governance disclosures for the DAO" />
          </div>
          <p className="text-agora-muted">Transparency reports and governance disclosures</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-muted">
            <FileText className="h-4 w-4" />
            <span className="text-sm">Total Reports</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Published</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.published}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-primary">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Quarterly</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.quarterly}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-accent">
            <Shield className="h-4 w-4" />
            <span className="text-sm">Audits</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.audits}</p>
        </div>
      </div>

      {/* Report List */}
      <div className="space-y-4">
        {mockReports.map((report) => {
          const StatusIcon = statusConfig[report.status].icon;

          return (
            <div
              key={report.id}
              className="group rounded-lg border border-agora-border bg-agora-card p-5 transition-all hover:border-agora-primary/50 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`rounded-lg p-2 ${typeConfig[report.type].bg}`}>
                  <FileText className={`h-5 w-5 ${typeConfig[report.type].color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-agora-primary transition-colors">
                        {report.title}
                      </h3>
                      <p className="mt-1 text-sm text-agora-muted line-clamp-2">
                        {report.summary}
                      </p>
                    </div>

                    {/* Type Badge */}
                    <div
                      className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeConfig[report.type].bg} ${typeConfig[report.type].color}`}
                    >
                      {typeConfig[report.type].label}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
                    {/* Status */}
                    <span
                      className={`flex items-center gap-1 ${statusConfig[report.status].color}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig[report.status].label}
                    </span>

                    {/* Date */}
                    <span className="flex items-center gap-1 text-agora-muted">
                      <Calendar className="h-3 w-3" />
                      {new Date(report.date).toLocaleDateString()}
                    </span>

                    {/* Actions */}
                    {report.status === 'published' && (
                      <div className="ml-auto flex items-center gap-2">
                        <button className="flex items-center gap-1 text-agora-muted hover:text-slate-900 transition-colors">
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                        <button className="flex items-center gap-1 text-agora-primary hover:text-agora-primary/80 transition-colors">
                          <ExternalLink className="h-3 w-3" />
                          View
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

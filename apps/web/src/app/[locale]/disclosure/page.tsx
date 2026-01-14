'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Shield,
  FileText,
  Calendar,
  Download,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter,
  Search,
} from 'lucide-react';

import { HelpTooltip } from '@/components/guide/HelpTooltip';
import { DisclosureDetailModal } from '@/components/disclosure/DisclosureDetailModal';
import {
  fetchDisclosureReports,
  fetchDisclosureStats,
  type DisclosureReportType,
  type DisclosureReportStatus,
} from '@/lib/api';

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

const TYPES = ['all', 'quarterly', 'annual', 'incident', 'audit'] as const;
const STATUSES = ['all', 'published', 'pending', 'draft'] as const;

const typeConfig: Record<DisclosureReportType, { color: string; bg: string; label: string }> = {
  quarterly: { color: 'text-agora-primary', bg: 'bg-agora-primary/10', label: 'Quarterly' },
  annual: { color: 'text-agora-accent', bg: 'bg-agora-accent/10', label: 'Annual' },
  incident: { color: 'text-agora-warning', bg: 'bg-agora-warning/10', label: 'Incident' },
  audit: { color: 'text-agora-success', bg: 'bg-agora-success/10', label: 'Audit' },
};

const statusConfig: Record<DisclosureReportStatus, { icon: typeof CheckCircle; color: string; label: string }> = {
  published: { icon: CheckCircle, color: 'text-agora-success', label: 'Published' },
  pending: { icon: Clock, color: 'text-agora-warning', label: 'Pending' },
  draft: { icon: AlertCircle, color: 'text-agora-muted', label: 'Draft' },
};

export default function DisclosurePage() {
  const t = useTranslations('Navigation');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<DisclosureReport | null>(null);

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['disclosure-reports'],
    queryFn: () => fetchDisclosureReports(),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['disclosure-stats'],
    queryFn: fetchDisclosureStats,
    refetchInterval: 30000,
  });

  // Filter reports
  const filteredReports = reports?.filter((report) => {
    const matchesType = selectedType === 'all' || report.type === selectedType;
    const matchesStatus = selectedStatus === 'all' || report.status === selectedStatus;
    const matchesSearch =
      !searchQuery ||
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const displayStats = stats || {
    total: reports?.length || 0,
    published: reports?.filter((r) => r.status === 'published').length || 0,
    pending: reports?.filter((r) => r.status === 'pending').length || 0,
    draft: reports?.filter((r) => r.status === 'draft').length || 0,
    byType: {
      quarterly: reports?.filter((r) => r.type === 'quarterly').length || 0,
      annual: reports?.filter((r) => r.type === 'annual').length || 0,
      incident: reports?.filter((r) => r.type === 'incident').length || 0,
      audit: reports?.filter((r) => r.type === 'audit').length || 0,
    },
  };

  const handleDownload = (report: DisclosureReport) => {
    if (report.file_url) {
      window.open(report.file_url, '_blank');
    } else {
      // Generate a text file with the report content
      const content = `
${report.title}
${'='.repeat(report.title.length)}

Type: ${typeConfig[report.type].label} Report
Status: ${statusConfig[report.status].label}
Date: ${format(new Date(report.date), 'PPP')}
Author: ${report.author}

Summary
-------
${report.summary}

${report.content ? `\nContent\n-------\n${report.content}` : ''}

---
Generated from Algora Governance Platform
Report ID: ${report.id}
      `.trim();

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.id.slice(0, 8)}-${report.title.replace(/\s+/g, '-').toLowerCase()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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
          <p className="mt-2 text-2xl font-bold text-slate-900">{displayStats.total}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-success">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">Published</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{displayStats.published}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-primary">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Quarterly</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{displayStats.byType.quarterly}</p>
        </div>
        <div className="rounded-lg border border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2 text-agora-accent">
            <Shield className="h-4 w-4" />
            <span className="text-sm">Audits</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{displayStats.byType.audit}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agora-muted" />
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-agora-border bg-agora-card py-2 pl-10 pr-4 text-slate-900 placeholder-agora-muted focus:border-agora-primary focus:outline-none focus:ring-1 focus:ring-agora-primary"
          />
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-agora-muted" />
          <div className="flex flex-wrap gap-2">
            {TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedType === type
                    ? 'bg-agora-primary text-slate-900'
                    : 'bg-agora-card text-agora-muted hover:bg-agora-border'
                }`}
              >
                {type === 'all' ? 'All Types' : typeConfig[type as DisclosureReportType]?.label || type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-agora-muted">Status:</span>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedStatus === status
                  ? 'bg-agora-primary text-slate-900'
                  : 'bg-agora-card text-agora-muted hover:bg-agora-border'
              }`}
            >
              {status === 'all' ? 'All' : statusConfig[status as DisclosureReportStatus]?.label || status}
            </button>
          ))}
        </div>
      </div>

      {/* Report List */}
      {reportsLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-agora-border bg-agora-card"
            />
          ))}
        </div>
      ) : filteredReports?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-agora-border p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-agora-muted/50" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No Reports</h3>
          <p className="mt-2 text-sm text-agora-muted">
            {searchQuery || selectedType !== 'all' || selectedStatus !== 'all'
              ? 'No reports match your filters.'
              : 'No disclosure reports available yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReports?.map((report) => {
            const StatusIcon = statusConfig[report.status]?.icon || AlertCircle;
            const type = typeConfig[report.type] || typeConfig.quarterly;
            const status = statusConfig[report.status] || statusConfig.draft;

            return (
              <div
                key={report.id}
                className="group rounded-lg border border-agora-border bg-agora-card p-5 transition-all hover:border-agora-primary/50 hover:shadow-lg cursor-pointer"
                onClick={() => setSelectedReport(report)}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`rounded-lg p-2 ${type.bg}`}>
                    <FileText className={`h-5 w-5 ${type.color}`} />
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
                        className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${type.bg} ${type.color}`}
                      >
                        {type.label}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
                      {/* Status */}
                      <span
                        className={`flex items-center gap-1 ${status.color}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </span>

                      {/* Date */}
                      <span className="flex items-center gap-1 text-agora-muted">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(report.date), 'PPP')}
                      </span>

                      {/* Author */}
                      <span className="text-agora-muted">
                        by {report.author}
                      </span>

                      {/* Actions */}
                      {report.status === 'published' && (
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(report);
                            }}
                            className="flex items-center gap-1 text-agora-muted hover:text-slate-900 transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReport(report);
                            }}
                            className="flex items-center gap-1 text-agora-primary hover:text-agora-primary/80 transition-colors"
                          >
                            <Eye className="h-3 w-3" />
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
      )}

      {/* Detail Modal */}
      {selectedReport && (
        <DisclosureDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

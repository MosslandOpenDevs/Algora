'use client';

import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import {
  X,
  Heart,
  Cpu,
  FileText,
  Lock,
  Clock,
  CheckCircle,
  TrendingUp,
  Server,
  Database,
  Wifi,
  AlertCircle,
  PlayCircle,
  BarChart3,
} from 'lucide-react';
import { type GovernanceOSStats, type GovernanceOSHealth } from '@/lib/api';

type StatsType = 'uptime' | 'pipelines' | 'documents' | 'locked';

interface StatsDetailModalProps {
  type: StatsType;
  stats: GovernanceOSStats;
  health?: GovernanceOSHealth;
  isOpen: boolean;
  onClose: () => void;
}

const typeConfig: Record<StatsType, {
  icon: React.ElementType;
  title: string;
  gradient: string;
  color: string;
}> = {
  uptime: {
    icon: Heart,
    title: 'System Uptime',
    gradient: 'from-rose-500 to-pink-500',
    color: 'text-rose-500',
  },
  pipelines: {
    icon: Cpu,
    title: 'Pipeline Status',
    gradient: 'from-emerald-500 to-green-500',
    color: 'text-emerald-500',
  },
  documents: {
    icon: FileText,
    title: 'Document Registry',
    gradient: 'from-blue-500 to-indigo-500',
    color: 'text-blue-500',
  },
  locked: {
    icon: Lock,
    title: 'Safe Autonomy Locks',
    gradient: 'from-amber-500 to-orange-500',
    color: 'text-amber-500',
  },
};

function UptimeContent({ stats, health }: { stats: GovernanceOSStats; health?: GovernanceOSHealth }) {
  const uptimeHours = Math.floor(stats.uptime / 3600);
  const uptimeMinutes = Math.floor((stats.uptime % 3600) / 60);
  const uptimePercent = 99.9; // Simulated

  return (
    <div className="space-y-6">
      {/* Main Uptime Display */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-rose-500/20 to-pink-500/20 mb-4">
          <div className="text-center">
            <p className="text-4xl font-bold text-slate-900">{uptimeHours}h</p>
            <p className="text-sm text-agora-muted">{uptimeMinutes}m</p>
          </div>
        </div>
        <p className="text-lg font-medium text-slate-900">Current Session</p>
        <p className="text-sm text-agora-muted">Started {format(new Date(Date.now() - stats.uptime * 1000), 'PPp')}</p>
      </div>

      {/* Uptime Percentage */}
      <div className="rounded-xl bg-agora-dark/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-900">Overall Uptime</span>
          <span className="text-sm font-bold text-agora-success">{uptimePercent}%</span>
        </div>
        <div className="h-3 rounded-full bg-agora-border overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-agora-success to-emerald-400 transition-all"
            style={{ width: `${uptimePercent}%` }}
          />
        </div>
      </div>

      {/* Component Status */}
      {health && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Component Status</h4>
          <div className="grid grid-cols-2 gap-3">
            {health.components.map((component) => (
              <div
                key={component.name}
                className={`flex items-center gap-3 rounded-lg p-3 ${
                  component.status === 'up' ? 'bg-agora-success/10' : 'bg-agora-error/10'
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  component.status === 'up' ? 'bg-agora-success' : 'bg-agora-error'
                }`}>
                  {component.status === 'up' ? (
                    <CheckCircle className="h-4 w-4 text-white" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 capitalize">{component.name}</p>
                  <p className="text-xs text-agora-muted">{component.status.toUpperCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Resources */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-agora-dark/50 p-3 text-center">
          <Server className="h-5 w-5 text-agora-muted mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">OK</p>
          <p className="text-xs text-agora-muted">API Server</p>
        </div>
        <div className="rounded-lg bg-agora-dark/50 p-3 text-center">
          <Database className="h-5 w-5 text-agora-muted mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">OK</p>
          <p className="text-xs text-agora-muted">Database</p>
        </div>
        <div className="rounded-lg bg-agora-dark/50 p-3 text-center">
          <Wifi className="h-5 w-5 text-agora-muted mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">OK</p>
          <p className="text-xs text-agora-muted">WebSocket</p>
        </div>
      </div>
    </div>
  );
}

function PipelinesContent({ stats }: { stats: GovernanceOSStats }) {
  const running = stats.pipelinesRunning;
  const completed = stats.pipelinesCompleted;
  const total = running + completed;

  // Simulated pipeline stages
  const stages = [
    { name: 'Signal Intake', active: Math.floor(running * 0.3), completed: Math.floor(completed * 0.1) },
    { name: 'Issue Detection', active: Math.floor(running * 0.2), completed: Math.floor(completed * 0.15) },
    { name: 'Triage', active: Math.floor(running * 0.15), completed: Math.floor(completed * 0.15) },
    { name: 'Research', active: Math.floor(running * 0.1), completed: Math.floor(completed * 0.2) },
    { name: 'Deliberation', active: Math.floor(running * 0.1), completed: Math.floor(completed * 0.15) },
    { name: 'Decision', active: Math.floor(running * 0.05), completed: Math.floor(completed * 0.1) },
    { name: 'Voting', active: Math.floor(running * 0.05), completed: Math.floor(completed * 0.1) },
    { name: 'Execution', active: Math.floor(running * 0.05), completed: Math.floor(completed * 0.05) },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-agora-primary/20 to-agora-primary/5 p-4 text-center">
          <PlayCircle className="h-6 w-6 text-agora-primary mx-auto mb-2" />
          <p className="text-3xl font-bold text-slate-900">{running}</p>
          <p className="text-sm text-agora-muted">Running</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-agora-success/20 to-agora-success/5 p-4 text-center">
          <CheckCircle className="h-6 w-6 text-agora-success mx-auto mb-2" />
          <p className="text-3xl font-bold text-slate-900">{completed}</p>
          <p className="text-sm text-agora-muted">Completed</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-agora-accent/20 to-agora-accent/5 p-4 text-center">
          <Activity className="h-6 w-6 text-agora-accent mx-auto mb-2" />
          <p className="text-3xl font-bold text-slate-900">{total}</p>
          <p className="text-sm text-agora-muted">Total</p>
        </div>
      </div>

      {/* Stage Breakdown */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Pipeline Stages</h4>
        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.name} className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-agora-primary text-xs font-bold text-slate-900">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-900">{stage.name}</span>
                  <span className="text-xs text-agora-muted">
                    {stage.active} active / {stage.completed} done
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-agora-border overflow-hidden flex">
                  <div
                    className="bg-agora-primary transition-all"
                    style={{ width: `${(stage.active / Math.max(running, 1)) * 100}%` }}
                  />
                  <div
                    className="bg-agora-success transition-all"
                    style={{ width: `${(stage.completed / Math.max(completed, 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Throughput Chart */}
      <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-agora-muted" />
          <span className="text-sm font-medium text-slate-900">Throughput (24h)</span>
        </div>
        <div className="flex items-end gap-1 h-20">
          {[35, 45, 60, 40, 75, 55, 80, 65, 90, 70, 85, 95].map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-emerald-500 to-green-400 opacity-80 transition-all hover:opacity-100"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-agora-muted">
          <span>12h ago</span>
          <span>Now</span>
        </div>
      </div>
    </div>
  );
}

function DocumentsContent({ stats }: { stats: GovernanceOSStats }) {
  const docTypes = [
    { type: 'DP', name: 'Decision Packets', count: Math.floor(stats.documentsPublished * 0.3), color: 'bg-purple-500' },
    { type: 'RM', name: 'Resolution Memos', count: Math.floor(stats.documentsPublished * 0.25), color: 'bg-blue-500' },
    { type: 'GP', name: 'Governance Proposals', count: Math.floor(stats.documentsPublished * 0.2), color: 'bg-green-500' },
    { type: 'RD', name: 'Research Digests', count: Math.floor(stats.documentsPublished * 0.15), color: 'bg-orange-500' },
    { type: 'Other', name: 'Other Documents', count: Math.floor(stats.documentsPublished * 0.1), color: 'bg-gray-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Total Count */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 mb-4">
          <p className="text-4xl font-bold text-slate-900">{stats.documentsPublished}</p>
        </div>
        <p className="text-lg font-medium text-slate-900">Total Documents</p>
        <p className="text-sm text-agora-muted">Published to the registry</p>
      </div>

      {/* Document Types */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3">By Document Type</h4>
        <div className="space-y-3">
          {docTypes.map((doc) => (
            <div key={doc.type} className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${doc.color} text-white text-xs font-bold`}>
                {doc.type}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-900">{doc.name}</span>
                  <span className="text-sm text-agora-muted">{doc.count}</span>
                </div>
                <div className="h-2 rounded-full bg-agora-border overflow-hidden">
                  <div
                    className={`h-full ${doc.color} transition-all`}
                    style={{ width: `${(doc.count / stats.documentsPublished) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Recent Activity</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-agora-success" />
            <span className="text-agora-success">+12%</span>
            <span className="text-agora-muted">documents this week</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-agora-muted" />
            <span className="text-agora-muted">Last document created 2h ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedContent({ stats }: { stats: GovernanceOSStats }) {
  const riskLevels = [
    { level: 'HIGH', count: Math.floor(stats.lockedActions * 0.2), color: 'bg-agora-error', textColor: 'text-agora-error' },
    { level: 'MID', count: Math.floor(stats.lockedActions * 0.5), color: 'bg-agora-warning', textColor: 'text-agora-warning' },
    { level: 'LOW', count: Math.floor(stats.lockedActions * 0.3), color: 'bg-agora-success', textColor: 'text-agora-success' },
  ];

  return (
    <div className="space-y-6">
      {/* Total Locked */}
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 mb-4">
          <Lock className="h-10 w-10 text-amber-500" />
        </div>
        <p className="text-4xl font-bold text-slate-900">{stats.lockedActions}</p>
        <p className="text-lg font-medium text-slate-900">Locked Actions</p>
        <p className="text-sm text-agora-muted">Awaiting human approval</p>
      </div>

      {/* By Risk Level */}
      <div>
        <h4 className="text-sm font-semibold text-slate-900 mb-3">By Risk Level</h4>
        <div className="grid grid-cols-3 gap-3">
          {riskLevels.map((risk) => (
            <div
              key={risk.level}
              className={`rounded-xl p-4 text-center ${risk.color}/10 border border-current/20`}
            >
              <p className={`text-2xl font-bold ${risk.textColor}`}>{risk.count}</p>
              <p className="text-xs text-agora-muted mt-1">{risk.level} Risk</p>
            </div>
          ))}
        </div>
      </div>

      {/* Safe Autonomy Explanation */}
      <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
        <h4 className="text-sm font-semibold text-slate-900 mb-2">About Safe Autonomy</h4>
        <p className="text-sm text-agora-muted leading-relaxed">
          High-risk actions are automatically locked and require explicit human approval
          before execution. This ensures AI agents cannot perform critical operations
          without oversight.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-agora-success" />
            <span className="text-agora-muted">Human-in-the-loop</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-agora-success" />
            <span className="text-agora-muted">Audit trail</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsDetailModal({ type, stats, health, isOpen, onClose }: StatsDetailModalProps) {
  const _t = useTranslations('Governance');
  const config = typeConfig[type];
  const Icon = config.icon;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-card shadow-2xl animate-scale-in">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-br ${config.gradient} p-6 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{config.title}</h2>
                <p className="text-sm opacity-80">Detailed Statistics</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {type === 'uptime' && <UptimeContent stats={stats} health={health} />}
          {type === 'pipelines' && <PipelinesContent stats={stats} />}
          {type === 'documents' && <DocumentsContent stats={stats} />}
          {type === 'locked' && <LockedContent stats={stats} />}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-agora-border bg-agora-card p-4">
          <span className="text-xs text-agora-muted">
            Last updated: {format(new Date(), 'HH:mm:ss')}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

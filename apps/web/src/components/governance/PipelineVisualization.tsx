'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Radio,
  Search,
  AlertTriangle,
  BookOpen,
  MessageSquare,
  FileText,
  Vote,
  Play,
  CheckCircle,
  ChevronRight,
  Clock,
  Zap,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { type PipelineStage, type PipelineStatus } from '@/lib/api';

interface PipelineVisualizationProps {
  status?: PipelineStatus;
  compact?: boolean;
}

const STAGES: { key: PipelineStage; icon: React.ElementType; description: string; avgDuration: string }[] = [
  { key: 'signal_intake', icon: Radio, description: 'Collecting signals from various sources', avgDuration: '~5m' },
  { key: 'issue_detection', icon: Search, description: 'Analyzing signals for anomalies', avgDuration: '~10m' },
  { key: 'triage', icon: AlertTriangle, description: 'Prioritizing detected issues', avgDuration: '~5m' },
  { key: 'research', icon: BookOpen, description: 'Deep-diving into issue context', avgDuration: '~30m' },
  { key: 'deliberation', icon: MessageSquare, description: 'Agents discussing solutions', avgDuration: '~1h' },
  { key: 'decision_packet', icon: FileText, description: 'Generating decision documentation', avgDuration: '~15m' },
  { key: 'voting', icon: Vote, description: 'Community voting on proposals', avgDuration: '~24h' },
  { key: 'execution', icon: Play, description: 'Implementing approved decisions', avgDuration: '~2h' },
  { key: 'outcome_verification', icon: CheckCircle, description: 'Verifying execution results', avgDuration: '~30m' },
];

export function PipelineVisualization({ status, compact = false }: PipelineVisualizationProps) {
  const t = useTranslations('Governance.pipeline');
  const [hoveredStage, setHoveredStage] = useState<PipelineStage | null>(null);

  const getStageStatus = (stage: PipelineStage): 'completed' | 'current' | 'pending' => {
    if (!status) return 'pending';
    if (status.stagesCompleted.includes(stage)) return 'completed';
    if (status.currentStage === stage) return 'current';
    return 'pending';
  };

  // Simulated progress data when no real status is provided
  const simulatedProgress = status?.progress ?? 45;
  const completedCount = status?.stagesCompleted.length ?? Math.floor(simulatedProgress / 11);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STAGES.map((stage, index) => {
          const stageStatus = getStageStatus(stage.key);
          return (
            <div key={stage.key} className="flex items-center">
              <div
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  stageStatus === 'completed'
                    ? 'bg-agora-success'
                    : stageStatus === 'current'
                      ? 'bg-agora-primary animate-pulse'
                      : 'bg-agora-border'
                }`}
                title={t(`stages.${stage.key}`)}
              />
              {index < STAGES.length - 1 && (
                <div
                  className={`h-0.5 w-2 transition-all duration-300 ${
                    stageStatus === 'completed' ? 'bg-agora-success' : 'bg-agora-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="animate-fade-in rounded-lg border border-agora-border bg-agora-card overflow-hidden">
      {/* Header with stats */}
      <div className="bg-gradient-to-r from-agora-primary/10 via-agora-secondary/10 to-agora-tertiary/10 p-4 border-b border-agora-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-agora-primary" />
              {t('title')}
            </h3>
            <p className="text-sm text-agora-muted mt-1">
              {t('description', { defaultValue: '9-stage governance workflow processing' })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full bg-agora-card px-3 py-1.5 border border-agora-border">
              <Zap className="h-4 w-4 text-agora-warning" />
              <span className="text-sm font-medium text-slate-900">
                {completedCount}/{STAGES.length} {t('stages_completed', { defaultValue: 'stages' })}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-agora-card px-3 py-1.5 border border-agora-border">
              <TrendingUp className="h-4 w-4 text-agora-success" />
              <span className="text-sm font-medium text-slate-900">{simulatedProgress}%</span>
            </div>
          </div>
        </div>

        {/* Progress bar with gradient */}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-agora-border">
          <div
            className="h-full bg-gradient-to-r from-agora-primary via-agora-secondary to-agora-tertiary transition-all duration-700 ease-out relative"
            style={{ width: `${simulatedProgress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const stageStatus = getStageStatus(stage.key);
            const isHovered = hoveredStage === stage.key;

            return (
              <div key={stage.key} className="flex items-center">
                {/* Stage */}
                <div
                  className="relative"
                  onMouseEnter={() => setHoveredStage(stage.key)}
                  onMouseLeave={() => setHoveredStage(null)}
                >
                  <div
                    className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-all duration-300 cursor-default ${
                      stageStatus === 'completed'
                        ? 'bg-agora-success/10 text-agora-success'
                        : stageStatus === 'current'
                          ? 'bg-agora-primary/10 text-agora-primary scale-105'
                          : 'text-agora-muted hover:bg-agora-dark/50'
                    }`}
                  >
                    <div
                      className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300 ${
                        stageStatus === 'completed'
                          ? 'bg-agora-success text-white shadow-lg shadow-agora-success/25'
                          : stageStatus === 'current'
                            ? 'bg-agora-primary text-slate-900 shadow-lg shadow-agora-primary/25'
                            : 'bg-agora-border text-agora-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {stageStatus === 'current' && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-agora-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-agora-primary"></span>
                        </span>
                      )}
                      {stageStatus === 'completed' && (
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white">
                          <CheckCircle className="h-3 w-3 text-agora-success" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium whitespace-nowrap">
                      {t(`stages.${stage.key}`)}
                    </span>
                  </div>

                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 w-48 animate-scale-in">
                      <div className="rounded-lg border border-agora-border bg-agora-card p-3 shadow-xl">
                        <div className="text-xs font-semibold text-slate-900 mb-1">
                          {t(`stages.${stage.key}`)}
                        </div>
                        <p className="text-xs text-agora-muted leading-relaxed">
                          {stage.description}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-agora-muted">
                          <Clock className="h-3 w-3" />
                          <span>Avg: {stage.avgDuration}</span>
                        </div>
                      </div>
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-agora-card border-l border-t border-agora-border" />
                    </div>
                  )}
                </div>

                {/* Connector */}
                {index < STAGES.length - 1 && (
                  <div className="flex items-center px-0.5">
                    <ChevronRight
                      className={`h-4 w-4 transition-all duration-300 ${
                        stageStatus === 'completed'
                          ? 'text-agora-success'
                          : stageStatus === 'current'
                            ? 'text-agora-primary animate-pulse'
                            : 'text-agora-border'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer with legend */}
      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center justify-center gap-4 pt-3 border-t border-agora-border text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-agora-success" />
            <span className="text-agora-muted">{t('legend.completed', { defaultValue: 'Completed' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-agora-primary animate-pulse" />
            <span className="text-agora-muted">{t('legend.current', { defaultValue: 'In Progress' })}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-agora-border" />
            <span className="text-agora-muted">{t('legend.pending', { defaultValue: 'Pending' })}</span>
          </div>
        </div>
      </div>

      {/* Error display */}
      {status?.error && (
        <div className="mx-4 mb-4 rounded-lg bg-agora-error/10 p-3 text-sm text-agora-error animate-bounce-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {status.error}
          </div>
        </div>
      )}
    </div>
  );
}

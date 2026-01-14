'use client';

import { useTranslations } from 'next-intl';
import {
  X,
  GraduationCap,
  MessageSquare,
  Code,
  Globe,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  Workflow,
  ArrowRight,
  Play,
  BarChart3,
} from 'lucide-react';
import { type WorkflowStatus } from '@/lib/api';

interface WorkflowDetailModalProps {
  workflow: WorkflowStatus;
  isOpen: boolean;
  onClose: () => void;
}

const workflowIcons: Record<string, React.ElementType> = {
  A: GraduationCap,
  B: MessageSquare,
  C: Code,
  D: Globe,
  E: Users,
};

const workflowColors: Record<string, string> = {
  A: 'from-purple-500 to-indigo-500',
  B: 'from-blue-500 to-cyan-500',
  C: 'from-green-500 to-emerald-500',
  D: 'from-orange-500 to-amber-500',
  E: 'from-pink-500 to-rose-500',
};

const workflowDetails: Record<string, {
  fullName: string;
  purpose: string;
  stages: string[];
  stakeholders: string[];
  outcomes: string[];
}> = {
  A: {
    fullName: 'Academic Activity Workflow',
    purpose: 'Process AI/Blockchain research papers, academic publications, and research-related governance activities.',
    stages: ['Signal Detection', 'Research Analysis', 'Expert Review', 'Community Discussion', 'Publication'],
    stakeholders: ['Research Agents', 'Academic Advisors', 'Technical Reviewers'],
    outcomes: ['Research Digest', 'Tech Assessment', 'Knowledge Base Update'],
  },
  B: {
    fullName: 'Free Debate Workflow',
    purpose: 'Facilitate open-ended deliberation and community discussions on governance topics.',
    stages: ['Topic Proposal', 'Agora Session', 'Consensus Building', 'Summary Generation', 'Archive'],
    stakeholders: ['All Agents', 'Community Members', 'Moderators'],
    outcomes: ['Discussion Summary', 'Governance Proposal', 'Community Insights'],
  },
  C: {
    fullName: 'Developer Support Workflow',
    purpose: 'Process developer grant applications, technical contributions, and ecosystem development initiatives.',
    stages: ['Application Review', 'Technical Assessment', 'Budget Approval', 'Milestone Tracking', 'Completion'],
    stakeholders: ['Builder Agents', 'Technical Advisors', 'Treasury'],
    outcomes: ['Developer Grant', 'Milestone Report', 'Retroactive Reward'],
  },
  D: {
    fullName: 'Ecosystem Expansion Workflow',
    purpose: 'Evaluate and process partnership opportunities and ecosystem growth initiatives.',
    stages: ['Opportunity Detection', 'Due Diligence', 'Proposal Creation', 'Voting', 'Execution'],
    stakeholders: ['Investor Agents', 'Partnership Team', 'Legal Advisors'],
    outcomes: ['Partnership Proposal', 'Partnership Agreement', 'Ecosystem Report'],
  },
  E: {
    fullName: 'Working Groups Workflow',
    purpose: 'Manage formation, operation, and reporting of specialized working groups.',
    stages: ['Charter Creation', 'Member Recruitment', 'Operations', 'Periodic Reporting', 'Renewal/Closure'],
    stakeholders: ['Orchestrator Agents', 'WG Leaders', 'Core Team'],
    outcomes: ['WG Charter', 'WG Report', 'Resolution Memo'],
  },
};

export function WorkflowDetailModal({ workflow, isOpen, onClose }: WorkflowDetailModalProps) {
  const t = useTranslations('Governance.workflows');
  const Icon = workflowIcons[workflow.type] || MessageSquare;
  const gradient = workflowColors[workflow.type] || 'from-gray-500 to-gray-600';
  const details = workflowDetails[workflow.type] || {
    fullName: workflow.name,
    purpose: workflow.description,
    stages: [],
    stakeholders: [],
    outcomes: [],
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border border-agora-border bg-agora-card shadow-2xl animate-slide-up">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-br ${gradient} p-6 text-white`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Icon className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono opacity-80">
                    {t('type')} {workflow.type}
                  </span>
                </div>
                <h2 className="text-xl font-bold">{workflow.name}</h2>
                <p className="text-sm opacity-80 mt-1">{details.fullName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 opacity-80" />
                <span className="text-xs opacity-80">{t('active')}</span>
              </div>
              <p className="text-2xl font-bold">{workflow.activeCount}</p>
            </div>
            <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 opacity-80" />
                <span className="text-xs opacity-80">{t('completedToday')}</span>
              </div>
              <p className="text-2xl font-bold">{workflow.completedToday}</p>
            </div>
            <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 opacity-80" />
                <span className="text-xs opacity-80">{t('pendingApproval')}</span>
              </div>
              <p className="text-2xl font-bold">{workflow.pendingApproval}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 280px)' }}>
          {/* Purpose */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t('purpose')}</h3>
            <p className="text-sm text-agora-muted leading-relaxed">{details.purpose}</p>
          </div>

          {/* Pipeline Stages */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('pipelineStages')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {details.stages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-agora-dark/50 px-3 py-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-agora-primary text-xs font-bold text-slate-900">
                      {index + 1}
                    </div>
                    <span className="text-xs font-medium text-slate-900">{stage}</span>
                  </div>
                  {index < details.stages.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-agora-muted" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stakeholders */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('stakeholders')}</h3>
            <div className="flex flex-wrap gap-2">
              {details.stakeholders.map((stakeholder) => (
                <span
                  key={stakeholder}
                  className="inline-flex items-center gap-1.5 rounded-full bg-agora-accent/10 px-3 py-1 text-xs font-medium text-agora-accent"
                >
                  <Users className="h-3 w-3" />
                  {stakeholder}
                </span>
              ))}
            </div>
          </div>

          {/* Output Documents */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('outputDocuments')}</h3>
            <div className="grid grid-cols-3 gap-3">
              {details.outcomes.map((outcome) => (
                <div
                  key={outcome}
                  className="rounded-lg border border-agora-border bg-agora-dark/30 p-3 text-center"
                >
                  <Workflow className="h-5 w-5 text-agora-primary mx-auto mb-2" />
                  <span className="text-xs font-medium text-slate-900">{outcome}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Chart Placeholder */}
          <div className="rounded-lg border border-agora-border bg-agora-dark/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-agora-muted" />
              <span className="text-sm font-medium text-slate-900">{t('recentActivity')}</span>
            </div>
            <div className="flex items-end gap-1 h-16">
              {[40, 65, 45, 80, 55, 70, 90].map((height, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t bg-gradient-to-t ${gradient} opacity-80`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-agora-muted">
              <span>7 days ago</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between border-t border-agora-border bg-agora-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-agora-success/10 px-3 py-1.5 text-xs font-medium text-agora-success">
              <Play className="h-3 w-3" />
              {t('running')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-agora-muted transition-colors hover:bg-agora-border hover:text-slate-900"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

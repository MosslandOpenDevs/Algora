'use client';

import { useTranslations } from 'next-intl';
import {
  GraduationCap,
  MessageSquare,
  Code,
  Globe,
  Users,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { type WorkflowStatus } from '@/lib/api';

interface WorkflowCardProps {
  workflow: WorkflowStatus;
  onClick?: () => void;
  index?: number;
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

export function WorkflowCard({ workflow, onClick, index = 0 }: WorkflowCardProps) {
  const t = useTranslations('Governance.workflows');
  const Icon = workflowIcons[workflow.type] || MessageSquare;
  const gradient = workflowColors[workflow.type] || 'from-gray-500 to-gray-600';

  return (
    <div
      className="animate-slide-up rounded-lg border border-agora-border bg-agora-card p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-agora-primary/30 cursor-pointer"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-white shrink-0`}
        >
          <Icon className="h-6 w-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-agora-muted">
              {t('type')} {workflow.type}
            </span>
          </div>
          <h3 className="font-semibold text-agora-text truncate">{workflow.name}</h3>
          <p className="text-sm text-agora-muted line-clamp-1">{workflow.description}</p>
        </div>

        {/* Arrow */}
        <ArrowRight className="h-5 w-5 text-agora-muted shrink-0" />
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-agora-primary/10 px-2 py-1.5">
          <Clock className="h-3.5 w-3.5 text-agora-primary" />
          <span className="text-xs font-medium text-agora-primary">
            {workflow.activeCount} {t('active')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-agora-success/10 px-2 py-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-agora-success" />
          <span className="text-xs font-medium text-agora-success">
            {workflow.completedToday} {t('today')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-agora-warning/10 px-2 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-agora-warning" />
          <span className="text-xs font-medium text-agora-warning">
            {workflow.pendingApproval} {t('pending')}
          </span>
        </div>
      </div>
    </div>
  );
}

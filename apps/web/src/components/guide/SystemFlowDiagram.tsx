'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Radio,
  AlertCircle,
  MessageSquare,
  FileText,
  Target,
  ChevronRight,
} from 'lucide-react';

interface FlowStep {
  key: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bgColor: string;
}

const flowSteps: FlowStep[] = [
  {
    key: 'signals',
    icon: Radio,
    href: '/signals',
    color: 'text-agora-accent',
    bgColor: 'bg-agora-accent/10',
  },
  {
    key: 'issues',
    icon: AlertCircle,
    href: '/issues',
    color: 'text-agora-warning',
    bgColor: 'bg-agora-warning/10',
  },
  {
    key: 'agora',
    icon: MessageSquare,
    href: '/agora',
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
  },
  {
    key: 'proposals',
    icon: FileText,
    href: '/proposals',
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
  },
  {
    key: 'outcomes',
    icon: Target,
    href: '/proposals',
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
  },
];

interface SystemFlowDiagramProps {
  showDescriptions?: boolean;
  compact?: boolean;
  highlightCurrent?: boolean;
}

export function SystemFlowDiagram({
  showDescriptions = true,
  compact = false,
  highlightCurrent = true,
}: SystemFlowDiagramProps) {
  const t = useTranslations('Guide.flow');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  const currentPath = pathname.replace(/^\/[a-z]{2}/, '') || '/';

  const isStepActive = (href: string) => {
    if (!highlightCurrent) return false;
    return currentPath === href || currentPath.startsWith(href);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {flowSteps.map((step, index) => {
          const Icon = step.icon;
          const isActive = isStepActive(step.href);

          return (
            <div key={step.key} className="flex items-center">
              <Link
                href={`/${locale}${step.href}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all ${
                  isActive
                    ? `${step.bgColor} ${step.color} ring-2 ring-current`
                    : 'text-agora-muted hover:bg-agora-card hover:text-slate-900'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{t(`step${index + 1}`)}</span>
              </Link>
              {index < flowSteps.length - 1 && (
                <ChevronRight className="mx-1 h-3 w-3 text-agora-border" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
        {flowSteps.map((step, index) => {
          const Icon = step.icon;
          const isActive = isStepActive(step.href);

          return (
            <div key={step.key} className="flex items-center">
              <Link
                href={`/${locale}${step.href}`}
                className={`group flex flex-col items-center gap-2 rounded-xl p-4 transition-all ${
                  isActive
                    ? `${step.bgColor} ring-2 ring-current ${step.color}`
                    : 'hover:bg-agora-card'
                }`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${step.bgColor} transition-transform group-hover:scale-110`}
                >
                  <Icon className={`h-6 w-6 ${step.color}`} />
                </div>
                <div className="text-center">
                  <p
                    className={`text-sm font-medium ${isActive ? step.color : 'text-slate-900'}`}
                  >
                    {t(`step${index + 1}`)}
                  </p>
                  {showDescriptions && (
                    <p className="mt-0.5 text-xs text-agora-muted">
                      {t(`step${index + 1}Desc`)}
                    </p>
                  )}
                </div>
              </Link>
              {index < flowSteps.length - 1 && (
                <div className="mx-2 flex items-center md:mx-4">
                  <ChevronRight className="h-5 w-5 text-agora-border" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showDescriptions && (
        <div className="mt-8 rounded-lg border border-agora-border bg-agora-card/50 p-4">
          <p className="text-center text-sm text-agora-muted">
            {t('description')}
          </p>
        </div>
      )}
    </div>
  );
}

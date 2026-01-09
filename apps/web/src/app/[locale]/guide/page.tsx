'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Radio,
  AlertCircle,
  MessageSquare,
  FileText,
  Target,
  Users,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react';

import { SystemFlowDiagram } from '@/components/guide/SystemFlowDiagram';

const features = [
  {
    key: 'aiPowered',
    icon: Sparkles,
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
  },
  {
    key: 'realtime',
    icon: Zap,
    color: 'text-agora-accent',
    bgColor: 'bg-agora-accent/10',
  },
  {
    key: 'transparent',
    icon: Shield,
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
  },
];

const detailedSteps = [
  {
    key: 'signals',
    icon: Radio,
    href: '/signals',
    color: 'text-agora-accent',
    bgColor: 'bg-agora-accent/10',
    borderColor: 'border-agora-accent/30',
  },
  {
    key: 'issues',
    icon: AlertCircle,
    href: '/issues',
    color: 'text-agora-warning',
    bgColor: 'bg-agora-warning/10',
    borderColor: 'border-agora-warning/30',
  },
  {
    key: 'agora',
    icon: MessageSquare,
    href: '/agora',
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
    borderColor: 'border-agora-primary/30',
  },
  {
    key: 'proposals',
    icon: FileText,
    href: '/proposals',
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
    borderColor: 'border-agora-success/30',
  },
  {
    key: 'outcomes',
    icon: Target,
    href: '/proposals',
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
    borderColor: 'border-agora-primary/30',
  },
];

export default function GuidePage() {
  const t = useTranslations('Guide');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-agora-primary to-agora-accent">
          <BookOpen className="h-8 w-8 text-slate-900" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-2 text-lg text-agora-muted">{t('subtitle')}</p>
      </div>

      {/* Key Features */}
      <div className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.key}
              className={`rounded-xl border border-agora-border ${feature.bgColor} p-6`}
            >
              <Icon className={`h-8 w-8 ${feature.color}`} />
              <h3 className="mt-3 text-lg font-semibold text-slate-900">
                {t(`features.${feature.key}.title`)}
              </h3>
              <p className="mt-1 text-sm text-agora-muted">
                {t(`features.${feature.key}.desc`)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Visual Flow */}
      <div className="rounded-xl border border-agora-border bg-agora-card p-6">
        <h2 className="mb-6 text-center text-xl font-semibold text-slate-900">
          {t('flowTitle')}
        </h2>
        <SystemFlowDiagram showDescriptions={true} highlightCurrent={false} />
      </div>

      {/* Detailed Steps */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">{t('stepsTitle')}</h2>
        <div className="space-y-4">
          {detailedSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Link
                key={step.key}
                href={`/${locale}${step.href}`}
                className={`group flex items-start gap-4 rounded-xl border ${step.borderColor} ${step.bgColor} p-4 transition-all hover:ring-2 hover:ring-current ${step.color}`}
              >
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-agora-dark">
                  <span className="text-lg font-bold text-slate-900">
                    {index + 1}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${step.color}`} />
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t(`steps.${step.key}.title`)}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-agora-muted">
                    {t(`steps.${step.key}.desc`)}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-agora-muted">
                    <li>• {t(`steps.${step.key}.point1`)}</li>
                    <li>• {t(`steps.${step.key}.point2`)}</li>
                  </ul>
                </div>
                <ArrowRight className="h-5 w-5 text-agora-muted transition-transform group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Other Menu Sections */}
      <div className="rounded-xl border border-agora-border bg-agora-card p-6">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          {t('otherMenus.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={`/${locale}/agents`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <Users className="h-6 w-6 text-agora-primary" />
            <div>
              <h3 className="font-medium text-slate-900">
                {t('otherMenus.agents.title')}
              </h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.agents.desc')}
              </p>
            </div>
          </Link>
          <Link
            href={`/${locale}`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <Sparkles className="h-6 w-6 text-agora-accent" />
            <div>
              <h3 className="font-medium text-slate-900">
                {t('otherMenus.dashboard.title')}
              </h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.dashboard.desc')}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl bg-gradient-to-r from-agora-primary/20 to-agora-accent/20 p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t('cta.title')}</h2>
        <p className="mt-1 text-sm text-agora-muted">{t('cta.desc')}</p>
        <Link
          href={`/${locale}/signals`}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-agora-primary px-6 py-2.5 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
        >
          {t('cta.button')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

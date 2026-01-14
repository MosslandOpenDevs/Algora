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
  Building2,
  ShieldCheck,
  Clock,
  Eye,
  Lock,
  Unlock,
  Vote,
  GitBranch,
  Wallet,
  PiggyBank,
  UserPlus,
} from 'lucide-react';

import { SystemFlowDiagram } from '@/components/guide/SystemFlowDiagram';
import { HelpTooltip } from '@/components/guide/HelpTooltip';

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

const v2Features = [
  {
    icon: GitBranch,
    title: '5 Workflows',
    description: 'Academic Research, Free Debate, Developer Support, Ecosystem Expansion, Working Groups',
    color: 'text-blue-500',
  },
  {
    icon: Vote,
    title: 'Dual-House Voting',
    description: 'MossCoin House (token holders) + OpenSource House (contributors) for balanced decisions',
    color: 'text-purple-500',
  },
  {
    icon: Lock,
    title: 'Safe Autonomy',
    description: 'High-risk actions are LOCKED until explicit human approval. AI recommends, humans decide.',
    color: 'text-emerald-500',
  },
  {
    icon: FileText,
    title: 'Document Registry',
    description: 'Official documents with versioning, provenance tracking, and immutable audit trails',
    color: 'text-amber-500',
  },
  {
    icon: PiggyBank,
    title: 'Treasury Dashboard',
    description: 'Visual balance distribution, allocation tracking, transaction history, and token holder management',
    color: 'text-cyan-500',
  },
  {
    icon: UserPlus,
    title: 'Voting Delegation',
    description: 'Delegate voting power to trusted addresses with category filters and expiration options',
    color: 'text-pink-500',
  },
];

const safeAutonomyPrinciples = [
  {
    icon: Clock,
    title: 'System Never Stops',
    description: 'All operations are designed with delay-retry behavior. If blocked, the system queues work and continues other tasks.',
  },
  {
    icon: Lock,
    title: 'Dangerous Effects LOCKED',
    description: 'Fund transfers, contract deployments, and partnerships are always LOCKED until explicit human approval.',
  },
  {
    icon: Eye,
    title: 'Transparency by Default',
    description: 'All agent actions logged with full provenance. "Unreviewed by Human" label on auto-approved items.',
  },
  {
    icon: Unlock,
    title: 'Human Override Anytime',
    description: 'Any human can escalate any item. Veto power remains with governance participants.',
  },
];

export default function GuidePage() {
  const t = useTranslations('Guide');
  const th = useTranslations('HelpTooltips');
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

      {/* Mossland Vision */}
      <div className="rounded-xl border border-agora-primary/30 bg-gradient-to-r from-agora-primary/10 to-agora-accent/10 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-agora-primary/20">
            <Building2 className="h-6 w-6 text-agora-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Mossland Vision</h2>
            <p className="mt-2 text-agora-muted">
              Algora transforms governance from manual discussions into an autonomous AI-powered operating system.
              Building the bridge between virtual and physical worlds through community-driven governance,
              where 30+ AI agents work 24/7 while humans remain in control of all important decisions.
            </p>
          </div>
        </div>
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

      {/* v2.0 Features */}
      <div className="rounded-xl border border-agora-border bg-agora-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">
            Governance OS v2.0 Features
          </h2>
          <Link
            href={`/${locale}/governance`}
            className="flex items-center gap-2 rounded-lg bg-agora-primary/10 px-3 py-1.5 text-sm font-medium text-agora-primary transition-colors hover:bg-agora-primary/20"
          >
            View Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {v2Features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="flex items-start gap-3 rounded-lg bg-agora-darker p-4">
                <Icon className={`h-6 w-6 ${feature.color} flex-shrink-0`} />
                <div>
                  <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-1 text-sm text-agora-muted">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safe Autonomy Principles */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Safe Autonomy Guarantee</h2>
            <p className="text-sm text-agora-muted">Your assets are safe. AI recommends, humans decide.</p>
          </div>
          <HelpTooltip content={th('safeAutonomy')} position="right" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {safeAutonomyPrinciples.map((principle, index) => {
            const Icon = principle.icon;
            return (
              <div key={index} className="flex items-start gap-3 rounded-lg bg-white/50 p-4">
                <Icon className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-slate-900">{principle.title}</h3>
                  <p className="mt-1 text-xs text-agora-muted">{principle.description}</p>
                </div>
              </div>
            );
          })}
        </div>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Link
            href={`/${locale}/live`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <Zap className="h-6 w-6 text-red-500" />
            <div>
              <h3 className="font-medium text-slate-900">{t('otherMenus.live.title')}</h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.live.desc')}
              </p>
            </div>
          </Link>
          <Link
            href={`/${locale}/governance`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <Shield className="h-6 w-6 text-emerald-500" />
            <div>
              <h3 className="font-medium text-slate-900">{t('otherMenus.governance.title')}</h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.governance.desc')}
              </p>
            </div>
          </Link>
          <Link
            href={`/${locale}/treasury`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <PiggyBank className="h-6 w-6 text-cyan-500" />
            <div>
              <h3 className="font-medium text-slate-900">{t('otherMenus.treasury.title')}</h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.treasury.desc')}
              </p>
            </div>
          </Link>
          <Link
            href={`/${locale}/profile`}
            className="flex items-center gap-3 rounded-lg bg-agora-darker p-4 transition-colors hover:bg-agora-border"
          >
            <Wallet className="h-6 w-6 text-pink-500" />
            <div>
              <h3 className="font-medium text-slate-900">{t('otherMenus.profile.title')}</h3>
              <p className="text-xs text-agora-muted">
                {t('otherMenus.profile.desc')}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl bg-gradient-to-r from-agora-primary/20 to-agora-accent/20 p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t('cta.title')}</h2>
        <p className="mt-1 text-sm text-agora-muted">{t('cta.desc')}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/${locale}/signals`}
            className="inline-flex items-center gap-2 rounded-lg bg-agora-primary px-6 py-2.5 font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
          >
            {t('cta.button')}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={`/${locale}/governance`}
            className="inline-flex items-center gap-2 rounded-lg border border-agora-border bg-agora-card px-6 py-2.5 font-medium text-slate-900 transition-colors hover:bg-agora-border"
          >
            View Governance OS
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

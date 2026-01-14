'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Radio,
  AlertCircle,
  MessageSquare,
  FileText,
  ShieldCheck,
  Lightbulb,
  CheckCircle,
  Building2,
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'algora-tour-completed';

interface TourStep {
  key: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
  hasScenario?: boolean;
  hasVision?: boolean;
  hasPoints?: boolean;
  hasGuarantee?: boolean;
  hasCta?: boolean;
}

const tourSteps: TourStep[] = [
  {
    key: 'welcome',
    icon: Building2,
    color: 'text-agora-primary',
    bgColor: 'bg-gradient-to-br from-agora-primary/20 to-agora-accent/20',
    hasVision: true,
  },
  {
    key: 'problem',
    icon: Lightbulb,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    hasPoints: true,
  },
  {
    key: 'signals',
    icon: Radio,
    color: 'text-agora-accent',
    bgColor: 'bg-agora-accent/10',
    href: '/signals',
    hasScenario: true,
  },
  {
    key: 'issues',
    icon: AlertCircle,
    color: 'text-agora-warning',
    bgColor: 'bg-agora-warning/10',
    href: '/issues',
    hasScenario: true,
  },
  {
    key: 'agora',
    icon: MessageSquare,
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
    href: '/agora',
    hasScenario: true,
  },
  {
    key: 'proposals',
    icon: FileText,
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
    href: '/proposals',
    hasScenario: true,
  },
  {
    key: 'safeAutonomy',
    icon: ShieldCheck,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    href: '/governance',
    hasGuarantee: true,
  },
  {
    key: 'complete',
    icon: CheckCircle,
    color: 'text-agora-success',
    bgColor: 'bg-gradient-to-br from-agora-success/20 to-agora-primary/20',
    hasCta: true,
  },
];

interface WelcomeTourProps {
  forceShow?: boolean;
  onComplete?: () => void;
}

export function WelcomeTour({ forceShow = false, onComplete }: WelcomeTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const t = useTranslations('Guide.tour');
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split('/')[1] || 'en';

  useEffect(() => {
    if (forceShow) {
      setIsOpen(true);
      setCurrentStep(0);
      return;
    }

    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!hasCompletedTour) {
      const timer = setTimeout(() => setIsOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onComplete?.();
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleGoToPage = () => {
    const step = tourSteps[currentStep];
    if (step.href) {
      handleClose();
      router.push(`/${locale}${step.href}`);
    }
  };

  if (!isOpen) return null;

  const step = tourSteps[currentStep];
  const Icon = step.icon;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tourSteps.length - 1;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-agora-border bg-agora-dark shadow-2xl animate-slide-up">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center justify-between border-b border-agora-border bg-agora-card/50 px-6 py-3">
          <span className="text-xs font-medium text-agora-muted">
            {t('stepOf', { current: currentStep + 1, total: tourSteps.length })}
          </span>
          <div className="flex gap-1">
            {tourSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-6 bg-agora-primary'
                    : index < currentStep
                      ? 'w-1.5 bg-agora-primary/50'
                      : 'w-1.5 bg-agora-border'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${step.bgColor}`}
          >
            <Icon className={`h-10 w-10 ${step.color}`} />
          </div>

          <h2 className="text-center text-2xl font-bold text-slate-900">
            {t(`${step.key}.title`)}
          </h2>
          <p className="mt-3 text-center text-agora-muted leading-relaxed">
            {t(`${step.key}.desc`)}
          </p>

          {/* Vision text for welcome step */}
          {step.hasVision && (
            <div className="mt-4 rounded-lg bg-agora-primary/10 p-3 text-center">
              <p className="text-sm font-medium text-agora-primary">
                {t(`${step.key}.vision`)}
              </p>
            </div>
          )}

          {/* Points for problem step */}
          {step.hasPoints && (
            <div className="mt-4 space-y-2">
              {['24/7 monitoring when humans sleep', 'AI agents analyze all incoming data', 'Humans approve only final actions'].map((point, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-agora-card p-2">
                  <CheckCircle className="h-4 w-4 text-agora-success flex-shrink-0" />
                  <span className="text-sm text-slate-900">{point}</span>
                </div>
              ))}
            </div>
          )}

          {/* Scenario for steps */}
          {step.hasScenario && (
            <div className="mt-4 rounded-lg border border-agora-border bg-agora-card/50 p-3">
              <p className="text-xs italic text-agora-muted">
                {t(`${step.key}.scenario`)}
              </p>
            </div>
          )}

          {/* Guarantee for safe autonomy step */}
          {step.hasGuarantee && (
            <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-center">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-600">
                {t(`${step.key}.guarantee`)}
              </p>
            </div>
          )}

          {/* CTA for complete step */}
          {step.hasCta && (
            <p className="mt-4 text-center text-sm text-agora-muted">
              {t(`${step.key}.cta`)}
            </p>
          )}

          {step.href && !isLastStep && (
            <button
              onClick={handleGoToPage}
              className={`mt-4 mx-auto flex items-center gap-2 rounded-lg ${step.bgColor} px-4 py-2 text-sm font-medium ${step.color} transition-colors hover:opacity-80`}
            >
              {t('goToPage')}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-agora-border bg-agora-card px-6 py-4">
          <button
            onClick={handleClose}
            className="text-sm text-agora-muted transition-colors hover:text-slate-900"
          >
            {t('skip')}
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-lg bg-agora-darker px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-border"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('prev')}
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-lg bg-agora-primary px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-agora-primary/80"
            >
              {isLastStep ? t('finish') : t('next')}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}

export function hasTourCompleted() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
}

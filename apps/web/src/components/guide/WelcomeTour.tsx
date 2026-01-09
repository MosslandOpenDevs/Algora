'use client';

import { useState, useEffect } from 'react';
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
  Target,
  Sparkles,
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'algora-tour-completed';

interface TourStep {
  key: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
}

const tourSteps: TourStep[] = [
  {
    key: 'welcome',
    icon: Sparkles,
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
  },
  {
    key: 'signals',
    icon: Radio,
    color: 'text-agora-accent',
    bgColor: 'bg-agora-accent/10',
    href: '/signals',
  },
  {
    key: 'issues',
    icon: AlertCircle,
    color: 'text-agora-warning',
    bgColor: 'bg-agora-warning/10',
    href: '/issues',
  },
  {
    key: 'agora',
    icon: MessageSquare,
    color: 'text-agora-primary',
    bgColor: 'bg-agora-primary/10',
    href: '/agora',
  },
  {
    key: 'proposals',
    icon: FileText,
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
    href: '/proposals',
  },
  {
    key: 'complete',
    icon: Target,
    color: 'text-agora-success',
    bgColor: 'bg-agora-success/10',
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
      // Small delay to let the page load first
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-agora-border bg-agora-dark shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-agora-muted transition-colors hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-6">
          {tourSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`h-2 w-2 rounded-full transition-all ${
                index === currentStep
                  ? 'w-6 bg-agora-primary'
                  : index < currentStep
                    ? 'bg-agora-primary/50'
                    : 'bg-agora-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${step.bgColor}`}
          >
            <Icon className={`h-10 w-10 ${step.color}`} />
          </div>

          <h2 className="text-2xl font-bold text-slate-900">{t(`${step.key}.title`)}</h2>
          <p className="mt-3 text-agora-muted">{t(`${step.key}.desc`)}</p>

          {step.href && (
            <button
              onClick={handleGoToPage}
              className={`mt-4 inline-flex items-center gap-2 rounded-lg ${step.bgColor} px-4 py-2 text-sm font-medium ${step.color} transition-colors hover:opacity-80`}
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
}

// Helper to reset tour (for testing or when user wants to see it again)
export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}

// Helper to check if tour has been completed
export function hasTourCompleted() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
}

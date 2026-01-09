'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { HelpCircle, BookOpen, RotateCcw, Info } from 'lucide-react';

import { resetTour } from './WelcomeTour';

interface HelpMenuProps {
  onStartTour?: () => void;
}

export function HelpMenu({ onStartTour }: HelpMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('Guide.help');
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartTour = () => {
    setIsOpen(false);
    resetTour();
    onStartTour?.();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-agora-border bg-agora-dark shadow-lg">
          <div className="p-2">
            <button
              onClick={handleStartTour}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t('startTour')}</span>
            </button>
            <a
              href={`/${locale}/guide`}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
            >
              <BookOpen className="h-4 w-4" />
              <span>{t('viewFlow')}</span>
            </a>
            <div className="my-2 border-t border-agora-border" />
            <a
              href="https://github.com/mossland/Algora/blob/main/USER_GUIDE.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900"
            >
              <Info className="h-4 w-4" />
              <span>{t('docs')}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

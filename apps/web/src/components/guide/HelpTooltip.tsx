'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface TooltipPosition {
  top: number;
  left: number;
}

export function HelpTooltip({ content, title, position = 'bottom' }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 256; // w-64 = 16rem = 256px
    const tooltipHeight = 100; // approximate height
    const gap = 8;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        break;
    }

    // Ensure tooltip stays within viewport
    const padding = 16;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

    setTooltipPos({ top, left });
  }, [position]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
    }
  }, [isOpen, calculatePosition]);

  const handleOpen = () => {
    calculatePosition();
    setIsOpen(true);
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        onClick={() => isOpen ? setIsOpen(false) : handleOpen()}
        onMouseEnter={handleOpen}
        onMouseLeave={() => setIsOpen(false)}
        className="rounded-full p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-agora-primary"
        aria-label="Help"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
          }}
          className="z-[9999] w-64 rounded-lg border border-agora-border bg-agora-card p-3 shadow-lg"
        >
          {title && (
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-900">{title}</h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-agora-muted hover:text-slate-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <p className="text-xs leading-relaxed text-agora-muted">{content}</p>
        </div>
      )}
    </div>
  );
}

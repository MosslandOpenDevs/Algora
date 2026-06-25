'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HelpTooltipProps {
  content: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function HelpTooltip({ content, title, position = 'bottom' }: HelpTooltipProps) {
  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="rounded-full p-1 text-agora-muted transition-colors hover:bg-agora-card hover:text-agora-text focus:outline-none focus:ring-2 focus:ring-agora-primary"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={position} className="max-w-[256px]">
        {title && <p className="font-medium mb-1">{title}</p>}
        <p className="text-xs leading-relaxed">{content}</p>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

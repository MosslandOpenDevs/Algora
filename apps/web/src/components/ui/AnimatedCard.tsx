'use client';

import { ReactNode, CSSProperties } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  index?: number;
  animation?: 'slide-up' | 'slide-in-right' | 'slide-in-left' | 'scale-in' | 'bounce-in' | 'fade-in';
  hoverEffect?: boolean;
  glowOnActive?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

const animationClasses: Record<string, string> = {
  'slide-up': 'animate-slide-up',
  'slide-in-right': 'animate-slide-in-right',
  'slide-in-left': 'animate-slide-in-left',
  'scale-in': 'animate-scale-in',
  'bounce-in': 'animate-bounce-in',
  'fade-in': 'animate-fade-in',
};

export function AnimatedCard({
  children,
  index = 0,
  animation = 'slide-up',
  hoverEffect = true,
  glowOnActive = false,
  isActive = false,
  onClick,
  className = '',
}: AnimatedCardProps) {
  // Calculate stagger delay based on index (max 500ms)
  const delayMs = Math.min(index * 75, 500);

  const style: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    animationFillMode: 'backwards',
  };

  const baseClasses = 'rounded-lg border border-agora-border bg-agora-card';
  const animationClass = animationClasses[animation] || animationClasses['slide-up'];

  const hoverClasses = hoverEffect
    ? 'transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-agora-primary/10 hover:border-agora-primary/50'
    : '';

  const activeClasses = glowOnActive && isActive
    ? 'ring-2 ring-agora-primary/30 border-agora-primary/50'
    : '';

  const clickableClasses = onClick ? 'cursor-pointer' : '';

  return (
    <div
      className={`${baseClasses} ${animationClass} ${hoverClasses} ${activeClasses} ${clickableClasses} ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Simplified version for list items
interface AnimatedListItemProps {
  children: ReactNode;
  index?: number;
  className?: string;
}

export function AnimatedListItem({
  children,
  index = 0,
  className = '',
}: AnimatedListItemProps) {
  const delayMs = Math.min(index * 50, 400);

  const style: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    animationFillMode: 'backwards',
  };

  return (
    <div
      className={`animate-slide-up ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

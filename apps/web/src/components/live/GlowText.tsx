'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

interface GlowTextProps {
  children: ReactNode;
  className?: string;
  intensity?: 'subtle' | 'normal' | 'bright';
  color?: 'primary' | 'cyan' | 'purple' | 'green' | 'amber' | 'red';
}

const colorMap = {
  primary: 'rgba(22, 246, 171, VAR)',
  cyan: 'rgba(0, 194, 194, VAR)',
  purple: 'rgba(139, 92, 246, VAR)',
  green: 'rgba(16, 185, 129, VAR)',
  amber: 'rgba(245, 158, 11, VAR)',
  red: 'rgba(239, 68, 68, VAR)',
};

const intensityMap = {
  subtle: { shadow: 0.3, spread: 5 },
  normal: { shadow: 0.5, spread: 10 },
  bright: { shadow: 0.7, spread: 15 },
};

export function GlowText({
  children,
  className,
}: GlowTextProps) {
  // Removed glow effect for realistic terminal look
  return (
    <span className={clsx('inline-block text-[var(--live-glow)]', className)}>
      {children}
    </span>
  );
}

// Typing text with animation
interface TypingTextProps {
  text: string;
  className?: string;
  showCursor?: boolean;
  speed?: number;
}

export function TypingText({
  text,
  className,
  showCursor = true,
}: TypingTextProps) {
  return (
    <span className={clsx('inline-flex', className)}>
      <span>{text}</span>
      {showCursor && (
        <span className="animate-cursor-blink text-[var(--text-muted)] ml-0.5">_</span>
      )}
    </span>
  );
}

// Animated counter for live numbers
interface LiveCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  format?: 'number' | 'compact';
}

export function LiveCounter({
  value,
  prefix,
  suffix,
  className,
  format = 'number',
}: LiveCounterProps) {
  const formatted =
    format === 'compact'
      ? value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : String(value)
      : value.toLocaleString();

  return (
    <span className={clsx('tabular-nums', className)}>
      {prefix}
      <span className="inline-block animate-number-spin">{formatted}</span>
      {suffix}
    </span>
  );
}

// Progress bar with ASCII blocks
interface ASCIIProgressProps {
  value: number;
  max?: number;
  width?: number;
  className?: string;
  showPercent?: boolean;
}

export function ASCIIProgress({
  value,
  max = 100,
  width = 10,
  className,
  showPercent = true,
}: ASCIIProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return (
    <span className={clsx('font-terminal text-xs', className)}>
      [
      <span className="text-[var(--live-glow)]">{'█'.repeat(filled)}</span>
      <span className="text-[var(--text-dim)]">{'░'.repeat(empty)}</span>]
      {showPercent && <span className="ml-1 text-[var(--text-muted)]">{Math.round(percent)}%</span>}
    </span>
  );
}

// Sparkline visualization
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  color?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 20,
  className,
  color = '#059669',
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      className={clsx('inline-block', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Glow effect */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
      />
    </svg>
  );
}

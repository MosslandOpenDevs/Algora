'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

interface TerminalBoxProps {
  title?: string;
  variant?: 'single' | 'double';
  glow?: boolean;
  className?: string;
  children: ReactNode;
  headerRight?: ReactNode;
}

const BORDERS = {
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', cross: '╬', lt: '╠', rt: '╣' },
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', cross: '┼', lt: '├', rt: '┤' },
};

export function TerminalBox({
  title,
  variant = 'single',
  glow = false,
  className,
  children,
  headerRight,
}: TerminalBoxProps) {
  const b = BORDERS[variant];

  return (
    <div
      className={clsx(
        'terminal-box rounded-sm overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-[var(--live-border)] px-3 py-1.5">
          <span className="text-[var(--live-glow)] font-semibold text-xs uppercase tracking-wider">
            {b.v} {title}
          </span>
          {headerRight}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

// Simpler ASCII header for section titles
export function TerminalHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-2 mb-2', className)}>
      <span className="text-[var(--live-glow)]">{'═'.repeat(2)}</span>
      <span className="text-[var(--text-bright)] font-semibold text-xs uppercase tracking-wider">
        {children}
      </span>
      <span className="text-[var(--live-glow)] flex-1">{'═'.repeat(20)}</span>
    </div>
  );
}

// Status indicator with glyph
export function StatusGlyph({
  status,
  size = 'sm',
}: {
  status: 'speaking' | 'active' | 'idle' | 'online' | 'offline';
  size?: 'sm' | 'md';
}) {
  const glyphs: Record<string, { char: string; class: string }> = {
    speaking: { char: '◉', class: 'glyph-speaking animate-pulse' },
    active: { char: '●', class: 'glyph-active' },
    idle: { char: '○', class: 'glyph-idle' },
    online: { char: '█', class: 'text-emerald-600' },
    offline: { char: '░', class: 'text-red-500' },
  };

  const { char, class: cls } = glyphs[status] || glyphs.idle;

  return (
    <span className={clsx(cls, size === 'md' ? 'text-base' : 'text-xs')}>
      {char}
    </span>
  );
}

// Blinking cursor component
export function BlinkingCursor({ className }: { className?: string }) {
  return (
    <span className={clsx('animate-cursor-blink text-[var(--text-muted)]', className)}>
      _
    </span>
  );
}

// Live indicator (REC dot)
export function LiveIndicator({ label = 'LIVE' }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[10px] text-red-400 font-medium uppercase">{label}</span>
    </div>
  );
}

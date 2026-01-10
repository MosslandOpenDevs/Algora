'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { LiveIndicator, StatusGlyph } from './TerminalBox';
import { GlowText } from './GlowText';

interface LiveHeaderProps {
  className?: string;
}

export function LiveHeader({ className }: LiveHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [uptime, setUptime] = useState({ days: 127, hours: 0, minutes: 0, seconds: 0 });
  const [currentTime, setCurrentTime] = useState('--:--:--');

  // Avoid hydration mismatch by only updating after mount
  useEffect(() => {
    setMounted(true);

    // Start from some base uptime (e.g., 127 days)
    const baseUptime = 127 * 24 * 60 * 60 * 1000; // 127 days in ms
    const startTime = Date.now() - baseUptime;

    const updateUptime = () => {
      const elapsed = Date.now() - startTime;
      const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
      const hours = Math.floor((elapsed % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((elapsed % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((elapsed % (60 * 1000)) / 1000);
      setUptime({ days, hours, minutes, seconds });
    };

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };

    updateUptime();
    updateTime();

    const interval = setInterval(() => {
      updateUptime();
      updateTime();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={clsx(
        'terminal-box flex items-center justify-between px-4 py-2',
        className
      )}
    >
      {/* Left - Logo and version */}
      <div className="flex items-center gap-4">
        <span className="text-[var(--live-glow)] font-bold text-sm tracking-wider">
          ALGORA LIVE
        </span>
        <span className="text-[var(--text-dim)] text-xs">v0.3.0-beta</span>
      </div>

      {/* Center - Status */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <StatusGlyph status="online" size="md" />
          <span className="text-[var(--text-bright)] text-xs font-medium">ONLINE</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Uptime:</span>
          <span className="text-[var(--text-bright)] tabular-nums font-terminal">
            {uptime.days}d {String(uptime.hours).padStart(2, '0')}:
            {String(uptime.minutes).padStart(2, '0')}:
            {String(uptime.seconds).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Right - Time and Live indicator */}
      <div className="flex items-center gap-4">
        <span className="text-[var(--text-muted)] text-xs tabular-nums font-terminal">
          {currentTime}
        </span>
        <LiveIndicator />
      </div>
    </div>
  );
}

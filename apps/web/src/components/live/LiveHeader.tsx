'use client';

import { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { LiveIndicator, StatusGlyph } from './TerminalBox';

interface LiveHeaderProps {
  className?: string;
}

export function LiveHeader({ className }: LiveHeaderProps) {
  const [uptime, setUptime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [currentTime, setCurrentTime] = useState('--:--:--');
  const baseUptimeRef = useRef<number>(0);
  const fetchTimeRef = useRef<number>(Date.now());

  // Fetch real uptime from API on mount
  useEffect(() => {
    const fetchUptime = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/api/health`);
        const data = await res.json();
        if (data.uptime) {
          baseUptimeRef.current = data.uptime * 1000; // Convert seconds to ms
          fetchTimeRef.current = Date.now();
        }
      } catch (error) {
        console.error('Failed to fetch uptime:', error);
      }
    };

    fetchUptime();

    // Refresh uptime from server every 5 minutes
    const refreshInterval = setInterval(fetchUptime, 5 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Update display every second
  useEffect(() => {
    const updateUptime = () => {
      // Calculate elapsed time since we fetched the uptime
      const elapsed = Date.now() - fetchTimeRef.current;
      const totalMs = baseUptimeRef.current + elapsed;

      const days = Math.floor(totalMs / (24 * 60 * 60 * 1000));
      const hours = Math.floor((totalMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((totalMs % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);
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
        'terminal-box flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:gap-4',
        className
      )}
    >
      {/* Left - Logo and version */}
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-[var(--live-glow)] font-bold text-xs sm:text-sm tracking-wider whitespace-nowrap">
          ALGORA LIVE
        </span>
        <span className="text-[var(--text-dim)] text-[10px] sm:text-xs whitespace-nowrap hidden xs:inline">v0.3.0-beta</span>
      </div>

      {/* Center - Status */}
      <div className="flex items-center gap-3 sm:gap-6 order-3 sm:order-2 w-full sm:w-auto justify-center sm:justify-start">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <StatusGlyph status="online" size="md" />
          <span className="text-[var(--text-bright)] text-[10px] sm:text-xs font-medium">ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[var(--text-muted)]">
          <span className="hidden sm:inline">Uptime:</span>
          <span className="text-[var(--text-bright)] tabular-nums font-terminal whitespace-nowrap">
            {uptime.days}d {String(uptime.hours).padStart(2, '0')}:{String(uptime.minutes).padStart(2, '0')}:{String(uptime.seconds).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Right - Time and Live indicator */}
      <div className="flex items-center gap-2 sm:gap-4 order-2 sm:order-3">
        <span className="text-[var(--text-muted)] text-[10px] sm:text-xs tabular-nums font-terminal hidden sm:inline">
          {currentTime}
        </span>
        <LiveIndicator />
      </div>
    </div>
  );
}

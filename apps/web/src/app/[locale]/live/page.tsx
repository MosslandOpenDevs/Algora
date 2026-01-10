'use client';

import { useEffect } from 'react';
import {
  LiveHeader,
  LiveMetrics,
  SignalStream,
  SystemBlueprint,
  ActivityLog,
  AgentChatter,
  AgoraPreview,
} from '@/components/live';

export default function LivePage() {
  // Add live-theme class to enable dark mode styles
  useEffect(() => {
    document.documentElement.classList.add('live-theme');

    return () => {
      document.documentElement.classList.remove('live-theme');
    };
  }, []);

  return (
    <div className="min-h-screen font-terminal text-[var(--text-bright)] relative overflow-hidden">
      {/* Main content */}
      <div className="relative z-10 max-w-[1920px] mx-auto p-4 space-y-4">
        {/* Header */}
        <LiveHeader />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column - Signal Stream */}
          <div className="lg:col-span-3">
            <SignalStream className="h-full" />
          </div>

          {/* Center column - System Blueprint */}
          <div className="lg:col-span-6">
            <SystemBlueprint />
          </div>

          {/* Right column - Live Metrics */}
          <div className="lg:col-span-3">
            <LiveMetrics />
          </div>
        </div>

        {/* Activity Log */}
        <ActivityLog />

        {/* Bottom row - Agent Chatter & Agora Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgentChatter />
          <AgoraPreview />
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-[var(--text-dim)] py-4">
          <span>ALGORA</span>
          <span className="mx-2">|</span>
          <span>24/7 Live Agentic Governance Platform</span>
          <span className="mx-2">|</span>
          <span>Powered by 30 AI Agents</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Activity, Server, Database, Users, HardDrive } from 'lucide-react';

interface SystemHealthCardProps {
  health: {
    status: string;
    uptime: number;
    memory: number;
    dbSize: number;
    agents: {
      total: number;
      active: number;
    };
  };
}

export function SystemHealthCard({ health }: SystemHealthCardProps) {
  const t = useTranslations('Engine.health');

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const metrics = [
    {
      icon: Server,
      label: t('uptime'),
      value: formatUptime(health.uptime),
      color: 'text-agora-success',
    },
    {
      icon: HardDrive,
      label: t('memory'),
      value: `${health.memory} MB`,
      color: 'text-agora-primary',
    },
    {
      icon: Database,
      label: t('database'),
      value: `${health.dbSize} MB`,
      color: 'text-agora-accent',
    },
    {
      icon: Users,
      label: t('agents'),
      value: `${health.agents.active}/${health.agents.total}`,
      color: 'text-agora-warning',
    },
  ];

  return (
    <div className="rounded-lg border border-agora-border bg-agora-card p-5">
      <div className="flex items-center gap-2 text-slate-900">
        <Activity className="h-5 w-5 text-agora-success" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-lg bg-agora-darker p-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${metric.color}`} />
                <span className="text-xs text-agora-muted">{metric.label}</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {metric.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* System Info */}
      <div className="mt-4 rounded-lg bg-agora-darker p-3">
        <p className="text-xs text-agora-muted">{t('systemInfo')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-agora-card px-2 py-0.5 text-xs text-agora-muted">
            Node.js v20
          </span>
          <span className="rounded-full bg-agora-card px-2 py-0.5 text-xs text-agora-muted">
            SQLite WAL
          </span>
          <span className="rounded-full bg-agora-card px-2 py-0.5 text-xs text-agora-muted">
            Socket.IO
          </span>
          <span className="rounded-full bg-agora-card px-2 py-0.5 text-xs text-agora-muted">
            Express
          </span>
        </div>
      </div>
    </div>
  );
}

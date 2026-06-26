'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, AlertTriangle, AlertCircle, XCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSocket } from '@/hooks/useSocket';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Alert {
  id: string;
  metricName: string;
  alertType: string;
  severity: string;
  currentValue: number;
  threshold: number;
  message: string;
  acknowledged: boolean;
  timestamp: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

export function AlertDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('Alerts');
  const queryClient = useQueryClient();

  const { subscribe, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected) return;

    const handleNewAlert = () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    };

    const unsubBudget = subscribe('alert:budget', handleNewAlert);
    const unsubActivity = subscribe('activity:event', (event: unknown) => {
      const activityEvent = event as { type: string };
      if (activityEvent.type === 'BUDGET_THROTTLE') {
        handleNewAlert();
      }
    });

    return () => {
      unsubBudget();
      unsubActivity();
    };
  }, [subscribe, isConnected, queryClient]);

  const { data: countData } = useQuery({
    queryKey: ['alerts-count'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/alerts/count`);
      if (!res.ok) throw new Error('Failed to fetch alert count');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/alerts?acknowledged=false&limit=10`);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    enabled: isOpen,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`${API_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to acknowledge alert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
      toast.success('Marked as read');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/api/alerts/acknowledge-all`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to acknowledge all alerts');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
      toast.success('All alerts marked as read');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  const unreadCount = countData?.count || 0;
  const alerts: Alert[] = alertsData?.alerts || [];

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-agora-muted" />;
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30';
      case 'error':
        return 'bg-orange-500/10 border-orange-500/30';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'bg-agora-card border-agora-border';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return t('justNow');
    if (diffMins < 60) return t('minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('hoursAgo', { count: diffHours });
    return date.toLocaleDateString();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-2 rounded-md px-2 md:px-3 py-1.5 text-sm text-agora-muted transition-colors hover:bg-agora-card hover:text-slate-900 dark:hover:text-white min-h-[36px]"
          aria-label={t('notifications')}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-agora-border dark:border-agora-dark-border px-4 py-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('title')}</h3>
          {alerts.length > 0 && (
            <button
              onClick={() => acknowledgeAllMutation.mutate()}
              disabled={acknowledgeAllMutation.isPending}
              className="flex items-center gap-1 text-xs text-agora-primary hover:text-agora-accent transition-colors disabled:opacity-50"
            >
              <CheckCheck className="h-3 w-3" />
              {t('markAllRead')}
            </button>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-agora-primary border-t-transparent" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-agora-muted">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t('noAlerts')}</p>
            </div>
          ) : (
            <div className="divide-y divide-agora-border dark:divide-agora-dark-border">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`relative p-3 ${getSeverityBg(alert.severity)} border-l-2`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white font-medium truncate">
                        {alert.alertType === 'budget_warning' && t('budgetWarning')}
                        {alert.alertType === 'budget_critical' && t('budgetCritical')}
                        {alert.alertType === 'budget_exhausted' && t('budgetExhausted')}
                      </p>
                      <p className="text-xs text-agora-muted mt-0.5 line-clamp-2">
                        {alert.message}
                      </p>
                      <p className="text-xs text-agora-muted/70 mt-1">
                        {formatTime(alert.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      disabled={acknowledgeMutation.isPending}
                      className="flex-shrink-0 p-1 rounded hover:bg-agora-card/50 text-agora-muted hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                      aria-label={t('dismiss')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {alerts.length > 0 && (
          <div className="border-t border-agora-border dark:border-agora-dark-border px-4 py-2">
            <p className="text-xs text-agora-muted text-center">
              {t('showingCount', { count: alerts.length })}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

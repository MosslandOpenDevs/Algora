'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Radio,
  AlertCircle,
  FileText,
  Shield,
  Settings,
  MessageSquare,
  Coins,
  BookOpen,
  Tv,
} from 'lucide-react';

const navItems = [
  { key: 'dashboard', href: '/', icon: LayoutDashboard },
  { key: 'live', href: '/live', icon: Tv, isLive: true },
  { key: 'guide', href: '/guide', icon: BookOpen },
  { key: 'agora', href: '/agora', icon: MessageSquare },
  { key: 'agents', href: '/agents', icon: Users },
  { key: 'signals', href: '/signals', icon: Radio },
  { key: 'issues', href: '/issues', icon: AlertCircle },
  { key: 'proposals', href: '/proposals', icon: FileText },
  { key: 'treasury', href: '/treasury', icon: Coins },
  { key: 'disclosure', href: '/disclosure', icon: Shield },
  { key: 'engine', href: '/engine', icon: Settings },
];

export function Sidebar() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();

  const locale = pathname.split('/')[1] || 'en';
  const currentPath = pathname.replace(/^\/[a-z]{2}/, '') || '/';

  return (
    <aside className="flex w-64 flex-col border-r border-agora-border bg-agora-dark">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-agora-border px-6">
        <Link href={`/${locale}`} className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-agora-primary to-agora-accent">
            <span className="text-lg font-bold text-slate-900">A</span>
          </div>
          <span className="text-xl font-bold text-slate-900">Algora</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive =
            currentPath === item.href ||
            (item.href !== '/' && currentPath.startsWith(item.href));
          const isLive = 'isLive' in item && item.isLive;

          return (
            <Link
              key={item.key}
              href={`/${locale}${item.href}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-agora-primary/10 text-agora-primary'
                  : isLive
                    ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                    : 'text-agora-muted hover:bg-agora-card hover:text-slate-900'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{t(item.key)}</span>
              {isLive && (
                <span className="relative flex h-2 w-2 ml-auto">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-agora-border p-4">
        <div className="rounded-lg bg-agora-card p-3">
          <p className="text-xs text-agora-muted">Powered by</p>
          <p className="text-sm font-medium text-slate-900">MOC Governance</p>
        </div>
      </div>
    </aside>
  );
}

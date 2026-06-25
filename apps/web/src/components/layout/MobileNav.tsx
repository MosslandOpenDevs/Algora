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
  Workflow,
  Menu,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const navItems = [
  { key: 'dashboard', href: '/', icon: LayoutDashboard },
  { key: 'live', href: '/live', icon: Tv, isLive: true },
  { key: 'guide', href: '/guide', icon: BookOpen },
  { key: 'governance', href: '/governance', icon: Workflow, isNew: true },
  { key: 'agora', href: '/agora', icon: MessageSquare },
  { key: 'agents', href: '/agents', icon: Users },
  { key: 'signals', href: '/signals', icon: Radio },
  { key: 'issues', href: '/issues', icon: AlertCircle },
  { key: 'proposals', href: '/proposals', icon: FileText },
  { key: 'treasury', href: '/treasury', icon: Coins },
  { key: 'disclosure', href: '/disclosure', icon: Shield },
  { key: 'engine', href: '/engine', icon: Settings },
];

interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ isOpen, onOpenChange }: MobileNavProps) {
  const t = useTranslations('Navigation');
  const pathname = usePathname();

  const locale = pathname.split('/')[1] || 'en';
  const currentPath = pathname.replace(/^\/[a-z]{2}/, '') || '/';

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-agora-border dark:border-agora-dark-border px-4 py-3">
          <SheetTitle asChild>
            <Link
              href={`/${locale}`}
              className="flex items-center gap-3"
              onClick={() => onOpenChange(false)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-agora-primary to-agora-accent">
                <span className="text-lg font-bold text-slate-900">A</span>
              </div>
              <span className="text-xl font-bold text-slate-900 dark:text-white">Algora</span>
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.href ||
              (item.href !== '/' && currentPath.startsWith(item.href));
            const isLive = 'isLive' in item && item.isLive;
            const isNew = 'isNew' in item && item.isNew;

            return (
              <Link
                key={item.key}
                href={`/${locale}${item.href}`}
                onClick={() => onOpenChange(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? 'bg-agora-primary/10 text-agora-primary'
                    : isLive
                      ? 'text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10'
                      : isNew
                        ? 'text-agora-accent hover:bg-agora-accent/10 hover:text-agora-accent'
                        : 'text-agora-muted hover:bg-agora-card dark:hover:bg-agora-dark-card hover:text-slate-900 dark:hover:text-white'
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
                {isNew && (
                  <span className="ml-auto rounded-full bg-agora-accent px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                    NEW
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-agora-border dark:border-agora-dark-border p-4">
          <div className="rounded-lg bg-agora-card dark:bg-agora-dark-card p-3">
            <p className="text-xs text-agora-muted">Powered by</p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">MOC Governance</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface MobileMenuButtonProps {
  onClick: () => void;
}

export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 rounded-lg text-agora-muted hover:bg-agora-card hover:text-agora-text transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
      aria-label="Open menu"
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}

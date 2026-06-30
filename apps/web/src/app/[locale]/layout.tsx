import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';

import '../globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ExperimentalBanner } from '@/components/ui/ExperimentalBanner';
import { NpcCityStrip } from '@/components/cross-link/NpcCityStrip';
import {
  type Locale,
  defaultLocale,
  isLocale,
  locales,
  ogLocale,
} from '@/i18n/locales';

const inter = Inter({ subsets: ['latin'] });

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  'https://algora.moss.land';

// Localized title/description per supported locale.
const seo: Record<Locale, { title: string; description: string }> = {
  en: {
    title: 'Algora — AI deliberation lab',
    description:
      'A lab where AI personas deliberate on Mossland topics in the open. AI proposes; MOC holders decide. Experimental and non-binding — not official governance.',
  },
  ko: {
    title: 'Algora — AI 숙의 실험실',
    description:
      'AI 페르소나가 모스랜드 의제를 공개적으로 숙의하는 실험실입니다. AI는 제안하고, 결정은 MOC 홀더가 합니다. 실험용이며 구속력이 없고, 공식 거버넌스가 아닙니다.',
  },
  ja: {
    title: 'Algora — AI 熟議ラボ',
    description:
      'AIペルソナがモスランドの議題を公開で熟議するラボです。AIは提案し、決めるのはMOCホルダー。実験用で拘束力はなく、公式ガバナンスではありません。',
  },
  zh: {
    title: 'Algora — AI 审议实验室',
    description:
      'AI 角色公开审议 Mossland 议题的实验室。AI 负责提议，由 MOC 持有者决定。实验性质，无约束力，并非官方治理。',
  },
};

export const viewport: Viewport = {
  // Match the browser address bar to the page surface in each mode (light:
  // slate-50 body bg; dark: near-black). The brand mint (#16f6ab) lives on as
  // the PWA manifest theme_color for the installed-app toolbar.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' },
  ],
  // App defaults to light and supports a dark toggle (ThemeContext) — advertise
  // both so UA form controls / scrollbars follow the active theme.
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const { title, description } = seo[locale];

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: '%s · Algora',
    },
    description,
    applicationName: 'Algora',
    keywords: ['governance', 'ai', 'agents', 'mossland', 'moc', 'blockchain'],
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
      ],
      shortcut: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
    // NOTE: canonical + hreflang are path-dependent, so the layout omits them
    // (otherwise every page would point at the locale home). They are set
    // per-path by the home page and by each route's server wrapper via
    // pageMetadata() in lib/seo.ts, and mirrored in sitemap.xml.
    openGraph: {
      type: 'website',
      siteName: 'Algora',
      title,
      description,
      locale: ogLocale[locale],
      alternateLocale: locales
        .filter(l => l !== locale)
        .map(l => ogLocale[l]),
      images: [
        { url: '/og.png', width: 1200, height: 630, alt: title },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: '/og.png', alt: title }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Algora',
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <div className="flex h-screen flex-col bg-agora-darker dark:bg-agora-dark-darker">
              <ExperimentalBanner />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden relative z-20">
                  <Header />
                  <main className="flex-1 overflow-auto p-4 md:p-6">
                    {children}
                    {/* NPC city cross-link — read-side fetch with 10-min
                        revalidate; renders nothing if npc.moss.land is down. */}
                    <NpcCityStrip />
                  </main>
                </div>
              </div>
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

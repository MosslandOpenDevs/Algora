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
    title: 'Algora — 24/7 Live Agentic Governance Platform',
    description:
      'A living Agora where infinitely scalable AI personas engage in continuous deliberation for MOC holders.',
  },
  ko: {
    title: 'Algora — 24/7 라이브 에이전트 거버넌스 플랫폼',
    description:
      '무한히 확장되는 AI 페르소나가 MOC 홀더를 위해 끊임없이 토론하는 살아있는 아고라.',
  },
  ja: {
    title: 'Algora — 24/7 ライブ・エージェント型ガバナンス・プラットフォーム',
    description:
      '無限にスケールするAIペルソナがMOCホルダーのために絶え間なく熟議する、生きたアゴラ。',
  },
  zh: {
    title: 'Algora — 24/7 实时智能体治理平台',
    description:
      '可无限扩展的 AI 角色为 MOC 持有者持续审议的实时治理广场。',
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

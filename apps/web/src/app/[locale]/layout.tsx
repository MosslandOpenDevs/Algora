import type { Metadata } from 'next';
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

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Algora - 24/7 Live Agentic Governance Platform',
  description:
    'A living Agora where infinitely scalable AI personas engage in continuous deliberation',
  keywords: ['governance', 'ai', 'agents', 'mossland', 'moc', 'blockchain'],
  manifest: '/manifest.json',
  themeColor: '#16f6ab',
  // Use static favicon (no dynamic generation)
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
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

const locales = ['en', 'ko'];

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

  if (!locales.includes(locale)) {
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

import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import LiveView from './LiveView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('live', locale);
}

export default function Page() {
  return <LiveView />;
}

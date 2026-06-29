import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import TimelineView from './TimelineView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('timeline', locale);
}

export default function Page() {
  return <TimelineView />;
}

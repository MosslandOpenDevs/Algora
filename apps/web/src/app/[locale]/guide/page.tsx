import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import GuideView from './GuideView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('guide', locale);
}

export default function Page() {
  return <GuideView />;
}

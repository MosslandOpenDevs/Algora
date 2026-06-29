import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import SignalsView from './SignalsView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('signals', locale);
}

export default function Page() {
  return <SignalsView />;
}

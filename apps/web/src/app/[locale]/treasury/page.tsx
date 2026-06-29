import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import TreasuryView from './TreasuryView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('treasury', locale);
}

export default function Page() {
  return <TreasuryView />;
}

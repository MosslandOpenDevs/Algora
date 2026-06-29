import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import DisclosureView from './DisclosureView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('disclosure', locale);
}

export default function Page() {
  return <DisclosureView />;
}

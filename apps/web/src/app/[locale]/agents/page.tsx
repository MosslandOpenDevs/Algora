import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import AgentsView from './AgentsView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('agents', locale);
}

export default function Page() {
  return <AgentsView />;
}

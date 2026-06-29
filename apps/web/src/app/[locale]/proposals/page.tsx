import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import ProposalsView from './ProposalsView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('proposals', locale);
}

export default function Page() {
  return <ProposalsView />;
}

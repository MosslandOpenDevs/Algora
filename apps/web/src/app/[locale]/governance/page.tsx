import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import GovernanceView from './GovernanceView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('governance', locale);
}

export default function Page() {
  return <GovernanceView />;
}

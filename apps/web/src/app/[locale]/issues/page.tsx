import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import IssuesView from './IssuesView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('issues', locale);
}

export default function Page() {
  return <IssuesView />;
}

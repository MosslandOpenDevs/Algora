import type { Metadata } from 'next';

import { issueDetailMetadata } from '@/lib/seo';
import IssueDetailView from './IssueDetailView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return issueDetailMetadata(locale, id);
}

export default function Page() {
  return <IssueDetailView />;
}

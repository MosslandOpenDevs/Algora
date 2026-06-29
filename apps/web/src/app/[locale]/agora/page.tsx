import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import AgoraView from './AgoraView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('agora', locale);
}

export default function Page() {
  return <AgoraView />;
}

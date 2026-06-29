import type { Metadata } from 'next';

import { pageMetadata } from '@/lib/seo';
import EngineView from './EngineView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata('engine', locale);
}

export default function Page() {
  return <EngineView />;
}

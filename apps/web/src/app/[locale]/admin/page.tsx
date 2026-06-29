import type { Metadata } from 'next';

import { privatePageMetadata } from '@/lib/seo';
import AdminView from './AdminView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return privatePageMetadata('admin', locale);
}

export default function Page() {
  return <AdminView />;
}

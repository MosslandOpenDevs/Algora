import type { Metadata } from 'next';

import { privatePageMetadata } from '@/lib/seo';
import ProfileView from './ProfileView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return privatePageMetadata('profile', locale);
}

export default function Page() {
  return <ProfileView />;
}

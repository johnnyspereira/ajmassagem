import { PublicBusinessPage } from './site/[slug]/page';
import { notFound } from 'next/navigation';
import { getDefaultPublicBusinessSlug } from '@/lib/public-site/server';

export default async function RootPage() {
  const slug = await getDefaultPublicBusinessSlug();
  // The domain root is the business website, never the legacy directory.
  if (!slug) notFound();
  return <PublicBusinessPage params={Promise.resolve({ slug })} />;
}

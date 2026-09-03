import { PublicBusinessPage } from './site/[slug]/page';
import { redirect } from 'next/navigation';
import { getDefaultPublicBusinessSlug } from '@/lib/public-site/server';

export default async function RootPage() {
  const slug = await getDefaultPublicBusinessSlug();
  if (!slug) redirect('/site');
  return <PublicBusinessPage params={Promise.resolve({ slug })} />;
}

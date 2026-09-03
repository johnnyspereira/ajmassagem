import { PublicBusinessPage } from './site/[slug]/page';
import { getDefaultPublicBusinessSlug } from '@/lib/public-site/server';

export default async function RootPage() {
  const slug = await getDefaultPublicBusinessSlug();
  if (!slug) return <PublicBusinessPage params={Promise.resolve({ slug: 'indisponivel' })} />;
  return <PublicBusinessPage params={Promise.resolve({ slug })} />;
}

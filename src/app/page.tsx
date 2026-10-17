import type { Metadata } from 'next';
import { PublicBusinessPage } from './site/[slug]/page';
import { notFound } from 'next/navigation';
import {
  getDefaultPublicBusinessSlug,
  getPublicBusinessSite,
} from '@/lib/public-site/server';

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getDefaultPublicBusinessSlug();
  const site = slug ? await getPublicBusinessSite(slug) : null;
  const fallback = previewForRoute('/');
  return shareMetadata({
    title: site?.settings.seo_title || fallback.title,
    description:
      site?.settings.seo_description ||
      site?.settings.hero_subtitle ||
      fallback.description,
    path: '/',
    brand: site?.account.name,
    index: true,
  });
}

export default async function RootPage() {
  const slug = await getDefaultPublicBusinessSlug();
  // The domain root is the business website, never the legacy directory.
  if (!slug) notFound();
  return <PublicBusinessPage params={Promise.resolve({ slug })} />;
}

import { shareMetadata } from '@/lib/sharing/metadata';
import { previewForRoute } from '@/lib/sharing/previews';

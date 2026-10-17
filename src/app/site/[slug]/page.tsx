import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JpMassagemPublicSite } from '@/components/website/jp-massagem-public-site';
import { getPublicBusinessSite } from '@/lib/public-site/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicBusinessSite(slug);
  if (!site)
    return shareMetadata({
      title: 'Site indisponível',
      description:
        'Esta página não está disponível. Consulte o site JP Massagem para conhecer os serviços.',
    });
  return shareMetadata({
    title: site.settings.seo_title || site.account.name,
    description:
      site.settings.seo_description ||
      site.settings.hero_subtitle ||
      previewForRoute('/site/[slug]').description,
    path: '/site/' + encodeURIComponent(slug),
    brand: site.account.name,
    index: true,
  });
}

export async function PublicBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getPublicBusinessSite(slug);

  if (!site) notFound();

  // The public root deliberately uses the JP editorial template instead of
  // the generic spa landing page. All copy, services, team and booking links
  // remain sourced from Website Builder, so this is a layout change only.
  return <JpMassagemPublicSite site={site} />;
}

export default PublicBusinessPage;

import { shareMetadata } from '@/lib/sharing/metadata';
import { previewForRoute } from '@/lib/sharing/previews';

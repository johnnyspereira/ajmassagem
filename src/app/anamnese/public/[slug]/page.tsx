import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';

export const metadata = metadataForRoute('/anamnese/public/[slug]');

export default async function PublicAnamnesisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicAnamnesis publicSlug={slug} />;
}

import { metadataForRoute } from '@/lib/sharing/metadata';

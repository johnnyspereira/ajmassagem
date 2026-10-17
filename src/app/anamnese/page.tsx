import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';
import { defaultAnamnesisSlug } from '@/lib/portal/public-routes';

export const metadata = metadataForRoute('/anamnese');

export const dynamic = 'force-dynamic';

export default async function FriendlyAnamnesisPage() {
  const slug = await defaultAnamnesisSlug();
  return <PublicAnamnesis publicSlug={slug || ''} />;
}

import { metadataForRoute } from '@/lib/sharing/metadata';

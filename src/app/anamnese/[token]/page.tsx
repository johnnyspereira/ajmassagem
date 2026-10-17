import { PublicAnamnesis } from '@/components/clinic/public-anamnesis';

export const metadata = metadataForRoute('/anamnese/[token]');

export default async function AnamnesisPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicAnamnesis token={token} />;
}

import { metadataForRoute } from '@/lib/sharing/metadata';

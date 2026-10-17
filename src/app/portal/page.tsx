import { ClientPortal } from '@/components/portal/client-portal';
import { defaultPortalSlug } from '@/lib/portal/public-routes';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return portalShareMetadata(await searchParams);
}

export const dynamic = 'force-dynamic';

export default async function FriendlyClientPortalPage() {
  const slug = await defaultPortalSlug();
  return <ClientPortal slug={slug || ''} />;
}

import { portalShareMetadata } from '@/lib/sharing/metadata';

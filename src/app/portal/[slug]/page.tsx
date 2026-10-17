import { ClientPortal } from '@/components/portal/client-portal';

export async function generateMetadata({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return portalShareMetadata(
    await searchParams,
    '/portal/' + encodeURIComponent(slug)
  );
}

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClientPortal slug={slug} />;
}

import { portalShareMetadata } from '@/lib/sharing/metadata';

import PrivacyPolicyPage from '@/app/privacy/[slug]/page';

export const metadata = metadataForRoute('/privacidade');

export default function PublicPrivacyPage() {
  return PrivacyPolicyPage({
    params: Promise.resolve({ slug: 'jp-massagem-999933' }),
  });
}

import { metadataForRoute } from '@/lib/sharing/metadata';

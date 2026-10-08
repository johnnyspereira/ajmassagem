import type { Metadata } from 'next';
import PrivacyPolicyPage from '@/app/privacy/[slug]/page';

export const metadata: Metadata = {
  title: 'Política de privacidade | JP Massagem',
  alternates: { canonical: 'https://jpmassagem.pt/privacidade' },
  robots: { index: true, follow: true },
};

export default function PublicPrivacyPage() {
  return PrivacyPolicyPage({
    params: Promise.resolve({ slug: 'jp-massagem-999933' }),
  });
}

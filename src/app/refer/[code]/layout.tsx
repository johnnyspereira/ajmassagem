import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://jpmassagem.pt').replace(/\/$/, '');

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const { data } = await supabaseAdmin()
    .from('referral_codes')
    .select('code,account:accounts(name,logo_url)')
    .ilike('code', code)
    .eq('is_active', true)
    .maybeSingle();
  const account = Array.isArray(data?.account) ? data.account[0] : data?.account;
  const business = account?.name || 'JP Massagem';
  const title = `Convite especial | ${business}`;
  const description = 'Recebeu uma indicação para conhecer a JP Massagem e beneficiar de uma oferta especial na primeira sessão.';
  const image = account?.logo_url || `${origin}/site-assets/jp-massagem-hero-v1.png`;
  return {
    title,
    description,
    applicationName: business,
    robots: { index: false, follow: false },
    icons: { icon: [{ url: image }], apple: [{ url: image }] },
    openGraph: { type: 'website', locale: 'pt_PT', url: `${origin}/refer/${encodeURIComponent(code)}`, siteName: business, title, description, images: [{ url: image }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function ReferralLayout({ children }: { children: ReactNode }) {
  return children;
}

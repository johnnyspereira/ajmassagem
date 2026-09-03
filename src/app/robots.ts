import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://jpmassagem.pt').replace(/\/$/, '');
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/portal', '/login', '/api', '/anamnese', '/voucher'] }], sitemap: `${origin}/sitemap.xml` };
}

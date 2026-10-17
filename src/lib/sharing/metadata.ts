import type { Metadata } from 'next';
import { getPublicUrl } from '@/lib/public-url';
import { previewForRoute } from './previews';

export const SHARE_IMAGE = '/social/jp-massagem-share-v1.png';
export function cleanPreviewText(value: string, max = 190) {
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
export function shareMetadata(input: {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  brand?: string;
  index?: boolean;
  type?: 'website' | 'profile';
}): Metadata {
  const brand = input.brand || 'JP Massagem';
  const title = cleanPreviewText(
    input.title.includes(brand) ? input.title : `${input.title} | ${brand}`,
    100
  );
  const description = cleanPreviewText(input.description);
  const imageUrl = getPublicUrl(SHARE_IMAGE, 'https://jpmassagem.pt');
  const image =
    input.image &&
    (/^https?:\/\//i.test(input.image) ||
      (input.image.startsWith('/') && !input.image.startsWith('//')))
      ? input.image.startsWith('/')
        ? getPublicUrl(input.image, 'https://jpmassagem.pt')
        : input.image
      : imageUrl;
  const url = input.path
    ? getPublicUrl(input.path, 'https://jpmassagem.pt')
    : undefined;
  return {
    title: { absolute: title },
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    robots: { index: Boolean(input.index), follow: Boolean(input.index) },
    openGraph: {
      type: input.type || 'website',
      locale: 'pt_PT',
      siteName: brand,
      title,
      description,
      ...(url ? { url } : {}),
      images: [
        {
          url: image,
          alt: `${brand} — Massagens e bem-estar`,
          ...(image === imageUrl
            ? { width: 1200, height: 630, type: 'image/png' }
            : {}),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
export function metadataForRoute(path: string) {
  const preview = previewForRoute(path);
  return shareMetadata({
    ...preview,
    path: !preview.sensitive && !path.includes('[') ? path : undefined,
    index: preview.public,
  });
}
export function portalShareMetadata(
  query: Record<string, string | string[] | undefined>,
  path = '/portal'
) {
  const key =
    query.book === '1'
      ? '/portal?book=1'
      : query.tab === 'finance'
        ? '/portal?tab=finance'
        : '/portal';
  const preview = previewForRoute(key);
  // Personal access tokens and query values never enter the card or its image URL.
  return shareMetadata({
    ...preview,
    path: key === '/portal' ? path : `${path}${key.slice('/portal'.length)}`,
  });
}

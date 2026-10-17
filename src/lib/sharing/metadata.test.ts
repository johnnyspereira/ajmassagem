import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINK_PREVIEWS, previewForRoute } from './previews';
import {
  cleanPreviewText,
  metadataForRoute,
  portalShareMetadata,
  shareMetadata,
} from './metadata';

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(path.join(directory, entry.name))
      : entry.name === 'page.tsx'
        ? [path.join(directory, entry.name)]
        : []
  );
}
describe('sharing coverage', () => {
  it('has authored copy for every page family in the application', () => {
    for (const file of pages('src/app')) {
      const route =
        '/' +
        path
          .relative('src/app', path.dirname(file))
          .split(path.sep)
          .filter((part) => !part.startsWith('('))
          .join('/');
      expect(previewForRoute(route), route).toMatchObject({
        path: route,
        title: expect.any(String),
        description: expect.any(String),
      });
    }
    expect(new Set(LINK_PREVIEWS.map((item) => item.path)).size).toBe(
      LINK_PREVIEWS.length
    );
  });
  it('does not include personal URL parameters in booking previews', () => {
    const meta = portalShareMetadata({
      book: '1',
      portal_token: 'secret-access',
      email: 'client@example.test',
      service: 'private-id',
    });
    expect(JSON.stringify(meta)).not.toContain('secret-access');
    expect(JSON.stringify(meta)).not.toContain('client@example.test');
    expect(JSON.stringify(meta)).not.toContain('private-id');
    expect(JSON.stringify(meta)).toContain('/portal?book=1');
  });
  it('keeps token links unindexed and out of canonical/preview URLs', () => {
    for (const item of LINK_PREVIEWS.filter((preview) => preview.sensitive)) {
      const meta = metadataForRoute(item.path);
      expect(meta.robots).toMatchObject({ index: false, follow: false });
      expect(meta.alternates).toBeUndefined();
      expect(JSON.stringify(meta.openGraph)).not.toContain(item.path);
    }
  });
  it('uses absolute image URLs with truthful default dimensions', () => {
    const meta = metadataForRoute('/testemunhos');
    expect(meta.title).toMatchObject({
      absolute: expect.stringContaining('JP Massagem'),
    });
    expect(meta.openGraph).toMatchObject({
      images: [
        expect.objectContaining({
          url: expect.stringMatching(/^https:\/\//),
          width: 1200,
          height: 630,
        }),
      ],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(meta.robots).toMatchObject({ index: true });
  });
  it('does not invent dimensions for a service photograph', () => {
    const meta = shareMetadata({
      title: 'Massagem Relaxante',
      description: 'Uma sessão adaptada ao seu conforto.',
      image: '/service-images/massagem-wellness.png',
      path: '/servicos/massagem-relaxante',
      index: true,
    });
    const images = meta.openGraph?.images as Array<{
      width?: number;
      url: string;
    }>;
    expect(images[0].width).toBeUndefined();
    expect(images[0].url).toMatch(/^https:\/\//);
  });
  it('strips markup and limits oversized public descriptions', () => {
    expect(cleanPreviewText('<p>Uma sessão</p>  de bem-estar.')).toBe(
      'Uma sessão de bem-estar.'
    );
    expect(cleanPreviewText('A'.repeat(500))).toHaveLength(190);
  });
});

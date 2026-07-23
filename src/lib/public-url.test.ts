import { afterEach, describe, expect, it } from 'vitest';

import { getPublicUrl } from './public-url';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

describe('getPublicUrl', () => {
  it('prefers the configured public site URL over the bind address', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://crm.example.com/';

    expect(getPublicUrl('/reset-password', 'http://0.0.0.0:3000')).toBe(
      'https://crm.example.com/reset-password'
    );
  });

  it('uses the browser origin when no public site URL is configured', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getPublicUrl('/reset-password', 'http://localhost:3000')).toBe(
      'http://localhost:3000/reset-password'
    );
  });
});

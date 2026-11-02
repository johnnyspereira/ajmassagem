import { expect, it } from 'vitest';
import {
  normalizeReviewUrl,
  reviewRequestUrl,
  withoutReviewLinkSettings,
} from './review-link';
it('preserves other clinic settings while excluding stale review destination values', () => {
  const value = {
    clinic_address: 'Lisboa',
    automated_message_templates: {},
    review_link_mode: 'system',
    review_google_url: 'old',
  };
  expect(withoutReviewLinkSettings(value)).toEqual({
    clinic_address: 'Lisboa',
    automated_message_templates: {},
  });
  expect(value.review_google_url).toBe('old');
});
it('keeps the personal system URL by default', () => {
  expect(
    reviewRequestUrl(undefined, null, 'https://crm.test/avaliar/personal')
  ).toEqual({ mode: 'system', url: 'https://crm.test/avaliar/personal' });
});
it('uses the chosen external address without falling back to the internal link', () => {
  expect(
    reviewRequestUrl(
      'google',
      ' https://example.test/review?place=abc ',
      'https://crm.test/avaliar/personal'
    )
  ).toEqual({ mode: 'google', url: 'https://example.test/review?place=abc' });
});
it.each([
  '',
  'http://example.test',
  'javascript:alert(1)',
  'data:text/plain,a',
  'https://user:pass@example.test',
  'https://example.test/a\nb',
  'https://example.test/' + 'a'.repeat(2048),
])('rejects unsafe or invalid addresses: %s', (url) => {
  expect(() => normalizeReviewUrl(url)).toThrow();
});
it('rejects unsupported modes and missing external URLs instead of sending an unintended destination', () => {
  expect(() => reviewRequestUrl('unknown', null, 'internal')).toThrow();
  expect(() => reviewRequestUrl('google', '', 'internal')).toThrow();
});

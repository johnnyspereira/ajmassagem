import { expect, it } from 'vitest';
import { renewalDeadline, effectiveRenewalDeadline } from './renewal-deadline';
it.each([
  ['2026-07-23T10:00:00Z', '2026-07-23T23:00:00.000Z'],
  ['2026-01-23T10:00:00Z', '2026-01-24T00:00:00.000Z'],
  ['2026-03-29T00:10:00Z', '2026-03-29T23:00:00.000Z'],
  ['2026-10-25T00:10:00Z', '2026-10-26T00:00:00.000Z'],
  ['2026-10-23T23:10:00Z', '2026-10-24T23:00:00.000Z'],
])('expires at Lisbon midnight for %s', (now, expected) => {
  expect(renewalDeadline(new Date(now)).toISOString()).toBe(expected);
});
it('caps previous 24-hour offers at the original sending day and preserves earlier deadlines', () => {
  expect(
    effectiveRenewalDeadline(
      '2026-10-23 12:00:00',
      '2026-10-24 12:00:00'
    ).toISOString()
  ).toBe('2026-10-23T23:00:00.000Z');
  expect(
    effectiveRenewalDeadline(
      '2026-10-23 12:00:00',
      '2026-10-23 15:00:00'
    ).toISOString()
  ).toBe('2026-10-23T15:00:00.000Z');
});

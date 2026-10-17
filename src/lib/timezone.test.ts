import { describe, expect, it } from 'vitest';

import {
  accountDateInput,
  accountDateTimeToUtc,
  accountTimeInput,
} from './timezone';

describe('account timezone scheduling', () => {
  it('displays Lisbon time independently of the browser timezone and observes DST', () => {
    expect(
      accountTimeInput(new Date('2026-10-17T16:27:00Z'), 'Europe/Lisbon')
    ).toBe('17:27');
    expect(
      accountTimeInput(new Date('2026-12-17T17:27:00Z'), 'Europe/Lisbon')
    ).toBe('17:27');
    expect(
      accountDateInput(new Date('2026-10-17T23:30:00Z'), 'Europe/Lisbon')
    ).toBe('2026-10-18');
  });
  it('stores the exact wall-clock time selected for Lisbon in UTC', () => {
    expect(
      accountDateTimeToUtc('2026-09-11', '15:30', 'Europe/Lisbon').toISOString()
    ).toBe('2026-09-11T14:30:00.000Z');
  });

  it('keeps the selected wall-clock time through the daylight-saving change', () => {
    const value = accountDateTimeToUtc('2026-01-11', '15:30', 'Europe/Lisbon');
    expect(value.toISOString()).toBe('2026-01-11T15:30:00.000Z');
    expect(accountDateInput(value, 'Europe/Lisbon')).toBe('2026-01-11');
    expect(accountTimeInput(value, 'Europe/Lisbon')).toBe('15:30');
  });
});

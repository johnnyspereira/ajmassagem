import { expect, it } from 'vitest';
import { salePaymentTimestamp } from './payment-date';
it('uses the actual morning time for today rather than a future noon', () => {
  expect(
    salePaymentTimestamp(
      '2026-10-28',
      'Europe/Lisbon',
      new Date('2026-10-28T10:23:00Z')
    )
  ).toBe('2026-10-28T10:23:00.000Z');
});
it('uses the clinic date across UTC midnight and daylight saving', () => {
  expect(
    salePaymentTimestamp(
      '2026-07-02',
      'Europe/Lisbon',
      new Date('2026-07-01T23:30:00Z')
    )
  ).toBe('2026-07-01T23:30:00.000Z');
  expect(
    salePaymentTimestamp(
      '2026-07-01',
      'Europe/Lisbon',
      new Date('2026-07-01T23:30:00Z')
    )
  ).toBe('2026-07-01T11:00:00.000Z');
});
it('preserves a retroactive date', () => {
  expect(
    salePaymentTimestamp(
      '2026-10-20',
      'Europe/Lisbon',
      new Date('2026-10-28T10:00:00Z')
    )
  ).toBe('2026-10-20T11:00:00.000Z');
});
it.each(['2026-10-29', '', '2026-02-31', '2026-13-01'])(
  'rejects invalid or future dates: %s',
  (day) => {
    expect(() =>
      salePaymentTimestamp(
        day,
        'Europe/Lisbon',
        new Date('2026-10-28T10:00:00Z')
      )
    ).toThrow();
  }
);

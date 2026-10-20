import { describe, expect, it } from 'vitest';
import { normalizeBirthDate } from './birth-date';
describe('Birthday calendar values', () => {
  it.each([
    '1990-05-03',
    '1990-05-03T00:00:00.000Z',
    new Date('1990-05-03T00:00:00Z'),
  ])('normalizes %s without changing the day', (value) => {
    expect(normalizeBirthDate(value)).toBe('1990-05-03');
  });
  it.each([
    null,
    undefined,
    '',
    '0000-00-00',
    '1990-02-30',
    'not-a-date',
    new Date(NaN),
  ])('rejects invalid date %s', (value) => {
    expect(normalizeBirthDate(value)).toBeNull();
  });
});

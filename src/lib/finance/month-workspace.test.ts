import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.select }));
import {
  financeMonthRange,
  loadFinanceMonth,
  loadFinanceToday,
} from './month-workspace';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockResolvedValue([]);
});
it('bounds the entire Lisbon month including both daylight saving changes', () => {
  const october = financeMonthRange('2026-10');
  expect(october.start.toISOString()).toBe('2026-09-30T23:00:00.000Z');
  expect(october.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  const march = financeMonthRange('2026-03');
  expect(march.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  expect(march.end.toISOString()).toBe('2026-03-31T23:00:00.000Z');
  expect(financeMonthRange('', new Date('2026-10-31T23:50:00Z')).month).toBe(
    '2026-10'
  );
  for (const invalid of ['all', '2026-13', '2026-1', '1999-12', '2101-01'])
    expect(() => financeMonthRange(invalid)).toThrow();
});
it('uses payment dates for receipts and sale dates for sales, with aggregate totals independent of pagination', async () => {
  await loadFinanceMonth(
    'account-a',
    '2026-10',
    new Date('2026-10-25T22:00:00Z')
  );
  for (const [sql, values] of mocks.select.mock.calls) {
    expect(values[0]).toBe('account-a');
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
  }
  const [billed, received, due, pending, earlier] = mocks.select.mock.calls;
  expect(billed[0]).toContain('SUM(total_amount)');
  expect(billed[0]).not.toContain('LIMIT');
  expect(billed[0]).toContain("status NOT IN ('voided','refunded')");
  expect(received[0]).toContain('p.paid_at>=?');
  expect(received[0]).not.toContain('s.created_at');
  expect(received[0]).toContain("p.status='confirmed'");
  expect(due[0]).toContain('created_at>=?');
  expect(pending[1]).toHaveLength(3);
  expect(earlier[1]).toHaveLength(2);
  expect(earlier[0]).toContain('s.created_at<?');
});
it('only includes today sessions that have ended and still need a final status', async () => {
  const now = new Date('2026-10-25T22:00:00Z');
  await loadFinanceToday('account', now);
  const [sql, values] = mocks.select.mock.calls[1];
  expect(sql).toContain("a.status IN ('scheduled','confirmed')");
  expect(sql).toContain('a.scheduled_end<=?');
  expect(values[1].toISOString()).toBe('2026-10-24T23:00:00.000Z');
  expect(values[2].toISOString()).toBe('2026-10-26T00:00:00.000Z');
  expect(values[3]).toBe(now);
});

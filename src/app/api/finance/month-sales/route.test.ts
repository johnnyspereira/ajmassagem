import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  calls: [] as [string, unknown[]][],
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Denied' }, { status: 403 }),
}));
vi.mock('@/lib/finance/month-workspace', () => ({
  financeMonthRange: () => ({
    start: new Date('2026-09-30T23:00:00Z'),
    end: new Date('2026-11-01T00:00:00Z'),
  }),
}));
import { GET } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  for (const method of ['select', 'eq', 'gte', 'lt', 'order', 'limit'])
    query[method] = (...args: unknown[]) => {
      mocks.calls.push([method, args]);
      return query;
    };
  mocks.role.mockResolvedValue({
    accountId: 'account-a',
    supabase: { from: () => query },
  });
});
it('loads a selected month in Lisbon using an exclusive end and account scope', async () => {
  expect(
    (
      await GET(
        new Request('https://crm.test/api/finance/month-sales?month=2026-10')
      )
    ).status
  ).toBe(200);
  expect(mocks.calls).toContainEqual(['eq', ['account_id', 'account-a']]);
  expect(mocks.calls).toContainEqual([
    'gte',
    ['created_at', '2026-09-30T23:00:00.000Z'],
  ]);
  expect(mocks.calls).toContainEqual([
    'lt',
    ['created_at', '2026-11-01T00:00:00.000Z'],
  ]);
});
it('preserves direct links to old sales without escaping the authenticated account', async () => {
  await GET(
    new Request(
      'https://crm.test/api/finance/month-sales?month=2026-10&sale=old-sale'
    )
  );
  expect(mocks.calls).toContainEqual(['eq', ['account_id', 'account-a']]);
  expect(mocks.calls).toContainEqual(['eq', ['id', 'old-sale']]);
  expect(mocks.calls.some((call) => call[0] === 'gte')).toBe(false);
});

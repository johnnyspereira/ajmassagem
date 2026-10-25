import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  load: vi.fn(),
  range: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Denied' }, { status: 403 }),
}));
vi.mock('@/lib/finance/month-workspace', () => ({
  loadFinanceMonth: mocks.load,
  financeMonthRange: mocks.range,
}));
import { GET } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.range.mockReturnValue({});
  mocks.load.mockResolvedValue({ month: '2026-10', pending: [] });
});
it('requires authorization before loading any finance data', async () => {
  mocks.role.mockRejectedValue(new Error('Denied'));
  expect(
    (await GET(new Request('https://crm.test/api/finance/workspace'))).status
  ).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it('validates the month and ignores any account supplied by the caller', async () => {
  const response = await GET(
    new Request(
      'https://crm.test/api/finance/workspace?month=2026-10&account=foreign'
    )
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.load).toHaveBeenCalledWith('account-a', '2026-10');
  mocks.range.mockImplementation(() => {
    throw new Error('Invalid');
  });
  expect(
    (await GET(new Request('https://crm.test/api/finance/workspace?month=all')))
      .status
  ).toBe(400);
});

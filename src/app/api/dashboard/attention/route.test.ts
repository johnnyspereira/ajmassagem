import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ role: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () =>
    Response.json({ error: 'Sem acesso' }, { status: 403 }),
}));
vi.mock('@/lib/dashboard/attention', () => ({ loadAttention: mocks.load }));
import { GET } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.load.mockResolvedValue({ total: 0, items: [] });
});
it('requires an operational role before reading personal or financial data', async () => {
  mocks.role.mockRejectedValueOnce(Error('Forbidden'));
  expect(
    (await GET(new Request('https://crm.test/api/dashboard/attention'))).status
  ).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it('ignores a foreign account supplied by the browser and prevents shared response caching', async () => {
  const response = await GET(
    new Request(
      'https://crm.test/api/dashboard/attention?account=foreign&kind=payments&page=2&q=Cliente'
    )
  );
  expect(response.status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('agent');
  expect(mocks.load).toHaveBeenCalledWith(
    'account-a',
    'payments',
    2,
    'Cliente'
  );
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it.each([
  'kind=anything',
  'page=-1',
  'page=1e2',
  'page=NaN',
  'q=' + 'a'.repeat(101),
])('rejects invalid filters before querying: %s', async (query) => {
  expect(
    (
      await GET(
        new Request('https://crm.test/api/dashboard/attention?' + query)
      )
    ).status
  ).toBe(400);
  expect(mocks.load).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  rows: vi.fn(),
  record: vi.fn(),
  schema: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () =>
    Response.json({ error: 'Sem acesso' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.rows }));
vi.mock('@/lib/portal/access-events', () => ({ recordAccess: mocks.record }));
vi.mock('@/lib/portal/store-schema', () => ({
  ensurePortalStoreSchema: mocks.schema,
}));
import { GET, POST } from './route';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'own', userId: 'member' });
  mocks.rows.mockResolvedValue([]);
});
it('allows viewing access history only for administrators of the authenticated account', async () => {
  const result = await GET(
    new Request(
      'https://crm.test/api/activity?scope=campaign&days=7&accountId=foreign'
    )
  );
  expect(result.status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('admin');
  expect(mocks.rows.mock.calls.every(([, args]) => args[0] === 'own')).toBe(
    true
  );
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  mocks.role.mockRejectedValueOnce(new Error('Forbidden'));
  mocks.rows.mockClear();
  expect((await GET(new Request('https://crm.test/api/activity'))).status).toBe(
    403
  );
  expect(mocks.rows).not.toHaveBeenCalled();
});
it('records the real member and account and discards query parameters', async () => {
  const result = await POST(
    new Request('https://crm.test/api/activity', {
      method: 'POST',
      body: JSON.stringify({
        path: '/finance?token=private',
        userId: 'other',
        accountId: 'foreign',
      }),
    })
  );
  expect(result.status).toBe(200);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith({
    accountId: 'own',
    userId: 'member',
    scope: 'crm',
    resource: '/finance',
  });
});
it('rejects invalid paths before recording', async () => {
  expect(
    (
      await POST(
        new Request('https://crm.test/api/activity', {
          method: 'POST',
          body: JSON.stringify({ path: 'https://foreign.test' }),
        })
      )
    ).status
  ).toBe(400);
  expect(mocks.record).not.toHaveBeenCalled();
});

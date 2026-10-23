import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  schema: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Denied' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
vi.mock('@/lib/clinic/catalog-order-schema', () => ({
  ensureCatalogOrderSchema: mocks.schema,
  catalogOrderSchemaError: () => null,
}));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('https://crm.test/api/clinic/catalog-order', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.schema.mockResolvedValue(undefined);
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT id FROM clinic_products')
      ? [[{ id: 'a' }, { id: 'b' }]]
      : [[]]
  );
  mocks.transaction.mockImplementation((work) =>
    work({ execute: mocks.execute })
  );
});
it('rejects duplicate IDs, unknown tables and malformed input before a write', async () => {
  for (const body of [
    { kind: 'products', ids: ['a', 'a'] },
    { kind: '__proto__', ids: [] },
    { kind: 'products', ids: [123] },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.schema).not.toHaveBeenCalled();
});
it('requires admin authorization', async () => {
  mocks.role.mockRejectedValue(new Error('Denied'));
  expect(
    (await POST(request({ kind: 'products', ids: ['a', 'b'] }))).status
  ).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('rejects stale lists or IDs from another account', async () => {
  expect(
    (await POST(request({ kind: 'products', ids: ['a', 'foreign'] }))).status
  ).toBe(409);
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
  ).toBe(false);
});
it('updates the complete order transactionally with account-scoped statements', async () => {
  expect(
    (await POST(request({ kind: 'products', ids: ['b', 'a'] }))).status
  ).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('admin');
  expect(mocks.schema).toHaveBeenCalledWith('products');
  expect(mocks.schema.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.transaction.mock.invocationCallOrder[0]
  );
  const updates = mocks.execute.mock.calls.filter(([sql]) =>
    sql.startsWith('UPDATE')
  );
  expect(updates.map(([, args]) => args)).toEqual([
    [0, 'b', 'account-a'],
    [1, 'a', 'account-a'],
  ]);
});

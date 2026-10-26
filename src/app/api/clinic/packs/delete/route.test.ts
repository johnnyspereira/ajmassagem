import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
  usage: false,
  sales: false,
  found: true,
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('https://crm.test/api/clinic/packs/delete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.usage = false;
  mocks.sales = false;
  mocks.found = true;
  mocks.role.mockResolvedValue({ accountId: 'account' });
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    expect(values).toEqual(['pack', 'account']);
    if (sql.includes('FROM finance_client_packs'))
      return [mocks.usage ? [{ id: 'client-pack' }] : []];
    if (sql.includes('FROM finance_sale_items'))
      return [mocks.sales ? [{ id: 'sale' }] : []];
    if (sql.startsWith('SELECT'))
      return [mocks.found ? [{ id: 'pack', name: 'Demo' }] : []];
    return [{ affectedRows: 1 }];
  });
  mocks.transaction.mockImplementation((work) =>
    work({ execute: mocks.execute })
  );
});
it('deletes only an unused pack scoped to the current account', async () => {
  expect((await POST(request({ id: 'pack' }))).status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('admin');
  expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(mocks.execute.mock.calls.at(-1)?.[0]).toBe(
    'DELETE FROM finance_pack_catalog WHERE id=? AND account_id=?'
  );
});
it.each(['usage', 'sales'] as const)(
  'preserves a pack referenced by %s',
  async (kind) => {
    mocks[kind] = true;
    expect((await POST(request({ id: 'pack' }))).status).toBe(409);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE'))
    ).toBe(false);
  }
);
it('returns not found for a missing pack without attempting deletion', async () => {
  mocks.found = false;
  expect((await POST(request({ id: 'pack' }))).status).toBe(404);
  expect(mocks.execute).toHaveBeenCalledOnce();
});
it.each([{}, { id: 123 }, { id: '' }])(
  'rejects invalid input before starting a transaction',
  async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  }
);
it('rejects callers without settings privileges', async () => {
  mocks.role.mockRejectedValue(new Error('Forbidden'));
  expect((await POST(request({ id: 'pack' }))).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('returns a clear conflict if another relation prevents deletion', async () => {
  mocks.transaction.mockRejectedValue({ code: 'ER_ROW_IS_REFERENCED_2' });
  expect((await POST(request({ id: 'pack' }))).status).toBe(409);
});

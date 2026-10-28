import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ role: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({ requireRole: mocks.role, toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }) }));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.select }));
import { GET } from './route';
const request = (query = '') => new Request(`https://crm.test/api/finance/pack-sales${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account' });
  mocks.select.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.includes('SELECT id,name,reference')) return [{ id: 'pack', name: 'Demo', reference: 'P1' }];
    if (sql.includes('COUNT(*) row_count')) return [{ sold: '5', row_count: 2, sales: 2 }];
    if (sql.includes('GROUP BY')) return [{ pack_id: 'pack', sold: '5' }];
    return [{ id: 'line', quantity: '3', sale_id: 'sale', sale_number: 10, status: 'paid' }];
  });
});
it('aggregates quantities across the account without loading individual sales or sessions', async () => {
  const result = await GET(request());
  expect(await result.json()).toEqual({ counts: { pack: 5 } });
  expect(mocks.role).toHaveBeenCalledWith('agent');
  const [sql, values] = mocks.select.mock.calls[0];
  expect(sql).toContain('SUM(i.quantity)');
  expect(sql).toContain("NOT IN ('voided','refunded','cancelled')");
  expect(sql).toContain('p.account_id=i.account_id');
  expect(values).toEqual(['account', 'account']);
  expect(sql).not.toContain('finance_payments');
  expect(sql).not.toContain('LIMIT');
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
});
it('opens a scoped report with the same eligibility rule, totals and bounded pagination', async () => {
  const result = await GET(request('?pack=pack&page=2'));
  const body = await result.json();
  expect(body).toMatchObject({ sold: 5, sales: 2, totalRows: 2, page: 2, pageSize: 50 });
  expect(mocks.select.mock.calls[0][1]).toEqual(['pack', 'account']);
  for (const [sql, values] of mocks.select.mock.calls.slice(1)) {
    expect(sql).toContain('i.source_id=?');
    expect(sql).toContain("NOT IN ('voided','refunded','cancelled')");
    expect(values.slice(0, 3)).toEqual(['account', 'account', 'pack']);
  }
  expect(mocks.select.mock.calls[2][1]).toEqual(['account', 'account', 'pack', 50]);
});
it('does not expose a missing or other-account pack', async () => {
  mocks.select.mockResolvedValueOnce([]);
  expect((await GET(request('?pack=other'))).status).toBe(404);
  expect(mocks.select).toHaveBeenCalledTimes(1);
});
it.each(['?pack=', '?pack=' + 'x'.repeat(65), '?page=0', '?page=NaN', '?page=1.5', '?page=1000001'])(
  'rejects invalid filters before querying: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  }
);
it('requires authentication and finance access before all queries', async () => {
  mocks.role.mockRejectedValue(new Error('Forbidden'));
  expect((await GET(request())).status).toBe(403);
  expect(mocks.select).not.toHaveBeenCalled();
});
it('returns zero totals and an empty list for a catalog pack with no sales', async () => {
  mocks.select.mockResolvedValueOnce([{ id: 'pack', name: 'Demo' }]).mockResolvedValueOnce([{ sold: null, row_count: 0, sales: 0 }]).mockResolvedValueOnce([]);
  expect(await (await GET(request('?pack=pack'))).json()).toMatchObject({ sold: 0, sales: 0, totalRows: 0, rows: [] });
});

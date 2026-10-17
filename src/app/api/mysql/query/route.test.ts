import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  hydrate: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.session }));
vi.mock('@/lib/auth/service', () => ({
  getAuthContext: async () => ({
    account: { id: 'tenant' },
    user: { id: 'user' },
    profile: { account_role: 'owner' },
  }),
}));
vi.mock('@/lib/mysql/db', () => ({ db: () => ({ execute: mocks.execute }) }));
vi.mock('@/lib/mysql/relations', () => ({
  hydrateRelationships: mocks.hydrate,
}));
import { POST } from './route';
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: 'user' } });
  mocks.execute.mockResolvedValue([[{ total: 42 }]]);
});
describe('dashboard count queries', () => {
  it('counts filtered tenant rows in SQL without loading or hydrating them', async () => {
    const response = await POST(
      new Request('https://crm.test/api/mysql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'automation_logs',
          operation: 'select',
          columns: 'id',
          head: true,
          count: 'exact',
          filters: [{ column: 'status', operator: 'eq', value: 'failed' }],
          limit: 5,
        }),
      })
    );
    expect(await response.json()).toMatchObject({
      data: null,
      count: 42,
      error: null,
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
    const [sql, values] = mocks.execute.mock.calls[0];
    expect(sql).toContain('SELECT COUNT(*) AS total');
    expect(sql).toContain('`account_id` = ?');
    expect(sql).not.toContain('LIMIT');
    expect(values).toContain('tenant');
    expect(values).toContain('failed');
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });
  it('still rejects requests without a session', async () => {
    mocks.session.mockResolvedValueOnce(null);
    const response = await POST(
      new Request('https://crm.test/api/mysql/query', { method: 'POST' })
    );
    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

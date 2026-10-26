import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('https://crm.test/api/finance/benefits/validity', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account', userId: 'owner' });
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.includes('FROM profiles')) return [[{ user_id: 'owner' }]];
    if (sql.startsWith('SELECT'))
      return [[{ status: 'expired', expires_at: '2020-01-01' }]];
    return [{ affectedRows: 1 }];
  });
  mocks.transaction.mockImplementation((work) =>
    work({ execute: mocks.execute })
  );
});
it.each(['voucher', 'pack'])(
  'updates %s expiry and audit together using Lisbon end of day',
  async (kind) => {
    const response = await POST(
      request({
        kind,
        id: 'benefit',
        expiresOn: '2027-07-01',
        reason: 'Prolongamento autorizado',
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith('owner');
    expect((await response.json()).expiresAt).toBe('2027-07-01T22:59:59.999Z');
    expect(
      mocks.execute.mock.calls
        .find(([sql]) => sql.startsWith('UPDATE'))?.[1]
        .slice(-2)
    ).toEqual(['benefit', 'account']);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.includes('finance_benefit_logs')
      )
    ).toBe(true);
  }
);
it('refuses invalid calendar dates and missing reasons before writing', async () => {
  for (const body of [
    { kind: 'voucher', id: 'x', expiresOn: '2027-02-31', reason: 'Autorizado' },
    { kind: 'pack', id: 'x', expiresOn: '2027-01-01', reason: '' },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('refuses cancelled or exhausted benefits', async () => {
  mocks.execute.mockImplementation(async (sql: string) => [
    sql.includes('FROM profiles')
      ? [{ user_id: 'owner' }]
      : [{ status: 'cancelled' }],
  ]);
  expect(
    (
      await POST(
        request({
          kind: 'voucher',
          id: 'x',
          expiresOn: '2027-01-01',
          reason: 'Autorizado',
        })
      )
    ).status
  ).toBe(409);
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
  ).toBe(false);
});
it('does not write if owner authorization is denied', async () => {
  mocks.role.mockRejectedValue(new Error('Forbidden'));
  expect((await POST(request({}))).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

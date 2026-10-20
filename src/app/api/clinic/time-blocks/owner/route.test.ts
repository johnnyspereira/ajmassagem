import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: (error: { status?: number }) =>
    Response.json({ error: 'Denied' }, { status: error.status || 500 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
import { POST } from './route';
const payload = {
  starts_at: '2026-10-20T08:00:00Z',
  ends_at: '2026-10-20T21:00:00Z',
  is_online_block: true,
  professional_profile_id: null,
  room_id: null,
  reason: 'Indisponibilidade',
};
const request = (body: unknown = payload) =>
  new Request('https://crm.test/api/clinic/time-blocks/owner', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mocks.role.mockResolvedValue({ accountId: 'account-a', userId: 'owner' });
  mocks.transaction.mockImplementation((work) =>
    work({ execute: mocks.execute })
  );
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT id FROM accounts')
      ? [[{ id: 'account-a' }]]
      : sql.startsWith('SELECT')
        ? [[]]
        : [{ affectedRows: 1 }]
  );
});
describe('Owner time blocks', () => {
  it('requires owner permission before accessing any data', async () => {
    mocks.role.mockRejectedValue({ status: 403 });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.role).toHaveBeenCalledWith('owner');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('creates the block and audit without changing existing appointments', async () => {
    expect((await POST(request())).status).toBe(200);
    const sql = mocks.execute.mock.calls.map((call) => call[0] as string);
    expect(
      sql.some((value) => value.startsWith('INSERT INTO clinic_time_blocks'))
    ).toBe(true);
    expect(
      sql.some((value) => value.startsWith('INSERT INTO clinic_agenda_events'))
    ).toBe(true);
    expect(sql.some((value) => value.includes('clinic_appointments'))).toBe(
      false
    );
  });
  it('still rejects overlapping blocks in the same resource', async () => {
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id FROM accounts')
        ? [[{ id: 'account-a' }]]
        : sql.startsWith('SELECT id,starts_at')
          ? [
              [
                {
                  id: 'block',
                  starts_at: new Date(payload.starts_at),
                  ends_at: new Date(payload.ends_at),
                  professional_profile_id: null,
                  room_id: null,
                },
              ],
            ]
          : [[]]
    );
    expect((await POST(request())).status).toBe(409);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))
    ).toBe(false);
  });
  it('does not edit a missing or foreign-account block', async () => {
    expect(
      (await POST(request({ ...payload, id: 'foreign-block' }))).status
    ).toBe(404);
    expect(
      mocks.execute.mock.calls.some(
        ([sql, args]) =>
          sql.includes('WHERE id=? AND account_id=? FOR UPDATE') &&
          args.includes('account-a')
      )
    ).toBe(true);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
    ).toBe(false);
  });
  it('requires selected resources to belong to the account', async () => {
    expect(
      (await POST(request({ ...payload, room_id: 'foreign-room' }))).status
    ).toBe(400);
  });
  it('rejects invalid intervals before beginning a transaction', async () => {
    expect(
      (await POST(request({ ...payload, ends_at: payload.starts_at }))).status
    ).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

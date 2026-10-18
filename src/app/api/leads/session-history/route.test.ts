import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ account: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.account,
  toErrorResponse: () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/mysql/db', () => ({ db: () => ({ execute: mocks.execute }) }));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('https://crm.test/api/leads/session-history', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
beforeEach(() => {
  mocks.account.mockResolvedValue({ accountId: 'account-a' });
  mocks.execute.mockResolvedValue([
    [
      {
        contact_id: 'client-1',
        last_session: '2026-10-01T10:00:00Z',
        total_sessions: 3,
      },
    ],
  ]);
});
describe('Lead session history', () => {
  it('aggregates only completed past appointments within the authenticated account', async () => {
    const response = await POST(
      request({ accountId: 'account-b', contactIds: ['client-1', 'client-1'] })
    );
    expect(response.status).toBe(200);
    const [sql, parameters] = mocks.execute.mock.calls[0];
    expect(sql).toContain("account_id = ? AND status = 'completed'");
    expect(sql).toContain('scheduled_start <= UTC_TIMESTAMP(3)');
    expect(sql).toContain('MAX(scheduled_start)');
    expect(parameters).toEqual(['account-a', 'client-1']);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('rejects unauthenticated access before touching the database', async () => {
    mocks.account.mockRejectedValue(new Error('Unauthorized'));
    expect((await POST(request({ contactIds: ['client-1'] }))).status).toBe(
      401
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('rejects invalid and oversized lists and avoids SQL for an empty list', async () => {
    expect((await POST(request({ contactIds: ["x' OR 1=1"] }))).status).toBe(
      400
    );
    expect(
      (await POST(request({ contactIds: Array(2001).fill('client-1') }))).status
    ).toBe(400);
    expect(await (await POST(request({ contactIds: [] }))).json()).toEqual({
      data: [],
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

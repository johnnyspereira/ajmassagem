import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ role: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: (error: { status?: number }) =>
    Response.json({ error: 'Denied' }, { status: error.status || 500 }),
}));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.select }));
import { GET } from './route';
beforeEach(() => {
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.select.mockResolvedValue([]);
});
it('returns only the authenticated account and disables caching', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(
    mocks.select.mock.calls.every(([, args]) => args[0] === 'account-a')
  ).toBe(true);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const appointmentSql = mocks.select.mock.calls[0][0];
  expect(appointmentSql).toContain("a.status IN ('scheduled','confirmed')");
  expect(appointmentSql).toContain('a.scheduled_start>UTC_TIMESTAMP()');
  expect(appointmentSql).not.toContain('INTERVAL 7 DAY');
});
it('rejects unauthorized users before reading customer records', async () => {
  mocks.role.mockRejectedValue({ status: 403 });
  expect((await GET()).status).toBe(403);
  expect(mocks.select).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  queries: [] as { method: string; args: unknown[] }[],
  send: vi.fn(),
  expiry: vi.fn(),
}));
vi.mock('@/lib/clinic/appointment-communication', () => ({
  sendAppointmentCommunication: mocks.send,
}));
vi.mock('@/lib/finance/expiry-reminders', () => ({
  sendBenefitExpiryReminders: mocks.expiry,
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => {
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      for (const method of [
        'select',
        'eq',
        'in',
        'is',
        'not',
        'lte',
        'gte',
        'gt',
        'limit',
        'order',
        'update',
        'maybeSingle',
      ])
        query[method] = (...args: unknown[]) => {
          mocks.queries.push({ method, args });
          return query;
        };
      return query;
    },
  }),
}));
import { GET } from './route';
beforeEach(() => {
  vi.stubEnv('AUTOMATION_CRON_SECRET', 'test-cron');
  mocks.queries = [];
  mocks.expiry.mockResolvedValue({
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: [],
  });
});
it('rejects unauthenticated invocations before querying or sending', async () => {
  expect(
    (
      await GET(
        new Request('https://crm.test/api/clinic/appointments/reminders')
      )
    ).status
  ).toBe(401);
  expect(mocks.queries).toHaveLength(0);
  expect(mocks.send).not.toHaveBeenCalled();
});
it('uses the intended 24 hour window and batch size without query parameters', async () => {
  const response = await GET(
    new Request('https://crm.test/api/clinic/appointments/reminders', {
      headers: { 'x-cron-secret': 'test-cron' },
    })
  );
  expect((await response.json()).window_minutes).toBe(1440);
  expect(
    mocks.queries.filter((q) => q.method === 'limit').map((q) => q.args[0])
  ).toEqual([25, 25]);
  expect(
    mocks.queries.filter((q) => q.method === 'in' && q.args[0] === 'status')
  ).toHaveLength(2);
  expect(
    mocks.queries.filter(
      (q) => q.method === 'gt' && q.args[0] === 'scheduled_start'
    )
  ).toHaveLength(2);
  expect(
    mocks.queries.filter(
      (q) => q.method === 'gte' && q.args[0] === 'scheduled_start'
    )
  ).toHaveLength(0);
});

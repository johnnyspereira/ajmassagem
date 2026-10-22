import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  mutate: mocks.mutate,
  transaction: (work: (connection: unknown) => unknown) =>
    work({ execute: mocks.execute }),
}));
import { executePortalRpc } from './portal-rpc';
beforeEach(() => {
  mocks.select.mockResolvedValue([
    { account_id: 'account', contact_id: 'contact', timezone: 'Europe/Lisbon' },
  ]);
  mocks.execute.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.includes('SELECT duration_minutes'))
      return [[{ duration_minutes: 50, price: 45 }]];
    if (sql.includes('SELECT working_hours'))
      return [
        [
          {
            working_hours: Object.fromEntries(
              ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [
                day,
                { enabled: true, start: '09:00', end: '22:00' },
              ])
            ),
          },
        ],
      ];
    if (sql.includes('SELECT id FROM clinic_appointments')) {
      const overlaps =
        Date.parse('2030-01-01T12:00:00Z') < (args[2] as Date).getTime() &&
        Date.parse('2030-01-01T12:50:00Z') > (args[3] as Date).getTime();
      return [overlaps ? [{ id: 'existing' }] : []];
    }
    return [[]];
  });
});
const book = (hour: string) =>
  executePortalRpc(
    'portal_create_appointment',
    {
      p_slug: 'clinic',
      p_service_id: 'service',
      p_professional_profile_id: 'professional',
      p_scheduled_start: `2030-01-01T${hour}:00:00Z`,
    },
    { id: 'client-user', email: 'test@example.test' }
  );
it('rejects online bookings in the before and after buffer before any appointment insert', async () => {
  for (const hour of ['11', '13'])
    expect((await book(hour)).error?.message).toContain('no longer available');
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO clinic_appointments')
    )
  ).toBe(false);
});
it('allows a 14:00 booking after a noon session ending 12:50', async () => {
  expect((await book('14')).error).toBeNull();
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO clinic_appointments')
    )
  ).toBe(true);
  const [, bounds] = mocks.execute.mock.calls.find(([sql]) =>
    sql.includes('SELECT id FROM clinic_appointments')
  )!;
  expect(bounds[2].toISOString()).toBe('2030-01-01T15:50:00.000Z');
  expect(bounds[3].toISOString()).toBe('2030-01-01T13:00:00.000Z');
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.includes('LIMIT 1 FOR UPDATE'))
  ).toBe(true);
});

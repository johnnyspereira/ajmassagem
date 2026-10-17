import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  execute: vi.fn(),
  notification: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
vi.mock('@/lib/clinic/appointment-communication', () => ({
  sendAppointmentStatusCommunication: mocks.notification,
  sendAppointmentCommunication: mocks.notification,
}));
import { POST } from './route';

const appointment = {
  id: 'a',
  status: 'scheduled',
  scheduled_start: '2099-10-20T12:00:00.000Z',
  scheduled_end: '2099-10-20T13:00:00.000Z',
  professional_profile_id: 'p',
  room_id: 'r',
  paid_at: null,
};
function call(body: Record<string, unknown>) {
  return POST(
    new Request('https://crm.test/api/clinic/appointments/a/dashboard-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedStart: appointment.scheduled_start,
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: 'a' }) }
  );
}
beforeEach(() => {
  mocks.role.mockResolvedValue({
    accountId: 'tenant',
    userId: 'user',
    supabase: {},
  });
  mocks.transaction.mockImplementation(async (work) =>
    work({ execute: mocks.execute })
  );
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT * FROM clinic_appointments')
      ? [[{ ...appointment }]]
      : [[]]
  );
  mocks.notification.mockResolvedValue({
    deliveries: { whatsapp: { sent: true }, email: { sent: false } },
  });
});
describe('dashboard appointment actions', () => {
  it('rejects unauthorized calls before opening a transaction', async () => {
    mocks.role.mockRejectedValueOnce(new Error('unauthorized'));
    expect((await call({ action: 'confirm' })).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects stale appointments without writing or notifying', async () => {
    expect(
      (
        await call({
          action: 'confirm',
          expectedStart: '2099-10-21T12:00:00.000Z',
        })
      ).status
    ).toBe(409);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
    ).toBe(false);
    expect(mocks.notification).not.toHaveBeenCalled();
  });
  it('confirms with tenant scope and an audit event', async () => {
    expect((await call({ action: 'confirm' })).status).toBe(200);
    const update = mocks.execute.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE clinic_appointments')
    );
    expect(update?.[1]).toEqual(['a', 'tenant']);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO clinic_agenda_events')
      )
    ).toBe(true);
    expect(mocks.notification).toHaveBeenCalledOnce();
  });
  it('returns reserved benefits in the cancellation transaction', async () => {
    expect(
      (await call({ action: 'cancel', reason: 'Pedido do cliente' })).status
    ).toBe(200);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.includes("status='released'")
      )
    ).toBe(true);
  });
  it('requires the refund flow when payments exist', async () => {
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT * FROM clinic_appointments')
        ? [[{ ...appointment, paid_at: '2099-10-01' }]]
        : [[]]
    );
    expect(
      (await call({ action: 'cancel', reason: 'Pedido do cliente' })).status
    ).toBe(409);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
    ).toBe(false);
  });
  it('rejects an overlapping reschedule without writing', async () => {
    mocks.execute.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT * FROM clinic_appointments')
        ? [[{ ...appointment }]]
        : sql.startsWith('SELECT id FROM clinic_appointments')
          ? [[{ id: 'busy' }]]
          : [[]]
    );
    expect(
      (
        await call({
          action: 'reschedule',
          startsAt: '2099-10-21T12:00:00.000Z',
        })
      ).status
    ).toBe(409);
    expect(
      mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
    ).toBe(false);
  });
  it('preserves duration and records the resolution on a reschedule', async () => {
    expect(
      (
        await call({
          action: 'reschedule',
          startsAt: '2099-10-21T12:00:00.000Z',
        })
      ).status
    ).toBe(200);
    const update = mocks.execute.mock.calls.find(([sql]) =>
      sql.includes('schedule_change_count=COALESCE')
    );
    expect(update?.[1][0].toISOString()).toBe('2099-10-21T12:00:00.000Z');
    expect(update?.[1][1].toISOString()).toBe('2099-10-21T13:00:00.000Z');
    expect(mocks.notification).toHaveBeenCalledWith(
      expect.objectContaining({ retry: true })
    );
  });
  it('reports delivery failure without claiming the saved change failed', async () => {
    mocks.notification.mockRejectedValueOnce(new Error('offline'));
    const response = await call({ action: 'confirm' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      warning: expect.any(String),
    });
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  today: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.select }));
vi.mock('./month-workspace', () => ({ loadFinanceToday: mocks.today }));
vi.mock('@/lib/notifications/account-events', () => ({
  notifyAccountEvent: mocks.notify,
}));
import {
  operationsAlertPhase,
  runDailyOperationsAlerts,
} from './daily-operations-alerts';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('SELECT DISTINCT')
      ? [{ id: 'account' }]
      : [
          {
            id: 'sale',
            sale_number: 42,
            name: 'Cliente de teste',
            client_reference: '123',
            balance_due: 35,
            currency: 'EUR',
            created_at: '2026-10-24T12:00:00Z',
          },
        ]
  );
  mocks.today.mockResolvedValue({
    day: '2026-10-25',
    cash: { id: 'cash', opened_at: '2026-10-25T08:00:00Z' },
    appointments: [
      {
        id: 'appointment',
        name: 'Cliente Exemplo',
        scheduled_start: '2026-10-25T19:00:00Z',
      },
    ],
    hasActivity: true,
  });
  mocks.notify.mockResolvedValue({ internal: 1, whatsapp: 'sent' });
});
it('uses Lisbon opening and two closing phases without midnight or daytime noise', () => {
  expect(operationsAlertPhase(new Date('2026-10-25T09:00:00Z'))).toBe(
    'opening'
  );
  expect(operationsAlertPhase(new Date('2026-10-25T12:00:00Z'))).toBeNull();
  expect(operationsAlertPhase(new Date('2026-10-25T21:30:00Z'))).toBe(
    'closing'
  );
  expect(operationsAlertPhase(new Date('2026-10-25T23:15:00Z'))).toBe(
    'last-call'
  );
  expect(operationsAlertPhase(new Date('2026-10-26T00:01:00Z'))).toBeNull();
  expect(operationsAlertPhase(new Date('2026-07-25T20:30:00Z'))).toBe(
    'closing'
  );
});
it('sends grouped actionable evening alerts with daily deduplication and retry support', async () => {
  expect(
    (await runDailyOperationsAlerts(new Date('2026-10-25T21:35:00Z'))).notified
  ).toBe(1);
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: 'account',
      dedupeKey: 'daily-operations:2026-10-25:closing',
      retryWhatsApp: true,
      actionUrl: '/dashboard#attention',
      body: expect.stringContaining('1 atendimento'),
    })
  );
  expect(mocks.notify.mock.calls[0][0].body).toContain('caixa');
  expect(mocks.notify.mock.calls[0][0].body).toContain('Cliente Exemplo');
  expect(mocks.notify.mock.calls[0][0].body).toContain(
    '/agenda?appointment=appointment'
  );
});
it('does not notify when there are no outstanding closing tasks', async () => {
  mocks.today.mockResolvedValue({
    day: '2026-10-25',
    cash: null,
    appointments: [],
    hasActivity: false,
  });
  await runDailyOperationsAlerts(new Date('2026-10-25T23:20:00Z'));
  expect(mocks.notify).not.toHaveBeenCalled();
});
it('reminds about unpaid sales and opening only when the day has activity', async () => {
  mocks.today.mockResolvedValue({
    day: '2026-10-25',
    cash: null,
    appointments: [],
    hasActivity: true,
  });
  await runDailyOperationsAlerts(new Date('2026-10-25T09:15:00Z'));
  expect(mocks.notify.mock.calls[0][0].body).toContain('Cliente de teste');
  expect(mocks.notify.mock.calls[0][0].body).toContain('Venda #42');
  expect(mocks.notify.mock.calls[0][0].body).toContain('35,00');
  expect(mocks.notify.mock.calls[0][0].body).toContain('Abra o caixa');
});
it('reports WhatsApp failure without claiming delivery and skips database access outside the windows', async () => {
  mocks.notify.mockResolvedValue({ internal: 1, whatsapp: 'failed' });
  expect(
    (await runDailyOperationsAlerts(new Date('2026-10-25T21:35:00Z'))).failed
  ).toBe(1);
  vi.clearAllMocks();
  expect(
    await runDailyOperationsAlerts(new Date('2026-10-25T15:00:00Z'))
  ).toEqual({ checked: 0, notified: 0, failed: 0 });
  expect(mocks.select).not.toHaveBeenCalled();
});

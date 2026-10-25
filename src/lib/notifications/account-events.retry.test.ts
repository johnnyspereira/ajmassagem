import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  mutate: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  mutate: mocks.mutate,
  transaction: mocks.transaction,
}));
vi.mock('@/lib/push/server', () => ({ sendPush: vi.fn() }));
vi.mock('@/lib/whatsapp/remote-worker', () => ({
  remoteWhatsAppWorker: { enabled: () => true, send: mocks.send },
}));
import { notifyAccountEvent } from './account-events';
const event = {
  accountId: 'account',
  type: 'daily_operations',
  category: 'finance' as const,
  title: 'Fechar o dia',
  body: 'Caixa por fechar',
  actionUrl: '/finance',
  dedupeKey: 'daily:day:closing',
  whatsappText: 'Feche o caixa',
  retryWhatsApp: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ADMIN_WHATSAPP_PHONE', '+351912345678');
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM profiles')
      ? [
          {
            user_id: 'owner',
            account_role: 'owner',
            full_name: 'Owner',
            professional_phone: null,
          },
        ]
      : []
  );
  mocks.mutate.mockResolvedValue({ affectedRows: 1 });
  mocks.transaction.mockResolvedValue('conversation');
  mocks.send.mockResolvedValue({ whatsappMessageId: 'accepted' });
});
it('retries WhatsApp even when the internal notification already exists', async () => {
  mocks.mutate.mockImplementation(async (sql: string) => ({
    affectedRows: sql.startsWith('INSERT IGNORE') ? 0 : 1,
  }));
  const result = await notifyAccountEvent(event);
  expect(result.internal).toBe(0);
  expect(result.whatsapp).toBe('sent');
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(
    mocks.mutate.mock.calls.some((call) =>
      call[0].includes("'$.whatsapp_alert_status','sent'")
    )
  ).toBe(true);
});
it('does not resend an accepted alert or an active claim', async () => {
  mocks.mutate.mockImplementation(async (sql: string) => ({
    affectedRows: sql.includes('whatsapp_alert_attempt_at') ? 0 : 1,
  }));
  expect((await notifyAccountEvent(event)).whatsapp).toBe('skipped');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('stores failure for retry rather than treating the internal notification as WhatsApp delivery', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.send.mockRejectedValue(new Error('offline'));
  expect((await notifyAccountEvent(event)).whatsapp).toBe('failed');
  expect(
    mocks.mutate.mock.calls.some((call) =>
      call[0].includes("'$.whatsapp_alert_status','failed'")
    )
  ).toBe(true);
  const claim = mocks.mutate.mock.calls.find((call) =>
    call[0].includes('whatsapp_alert_attempt_at')
  );
  expect(claim?.[0]).toContain('INTERVAL 10 MINUTE');
  log.mockRestore();
});
it('requires an actual WhatsApp message identifier before reporting acceptance', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.send.mockResolvedValue({});
  expect((await notifyAccountEvent(event)).whatsapp).toBe('failed');
  log.mockRestore();
});

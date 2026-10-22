import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./review-reminder-schema', () => ({
  ensurePrivacyReminderSchema: vi.fn().mockResolvedValue(undefined),
}));
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
vi.mock('@/lib/automations/meta-send', () => ({ engineSendText: mocks.send }));
import {
  privacyReviewMessage,
  runPrivacyReviewReminders,
  sendPrivacyReviewReminder,
} from './review-reminders';
beforeEach(() => {
  mocks.select.mockResolvedValue([]);
  mocks.transaction.mockResolvedValue(true);
  mocks.send.mockResolvedValue({ whatsapp_message_id: 'sent-id' });
});
it('blocks a WhatsApp refusal and withdrawn preferences without sending', async () => {
  for (const row of [
    { whatsapp_consent: 0, privacy_review_status: 'legacy_unverified' },
    { whatsapp_consent: true, privacy_review_status: 'withdrawn' },
  ]) {
    mocks.select.mockResolvedValue([{ ...row, phone: '351000000000' }]);
    await expect(
      sendPrivacyReviewReminder('account', 'contact', 'owner')
    ).rejects.toThrow();
  }
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('rejects recent or in-progress reminders before reaching the channel', async () => {
  mocks.select.mockResolvedValue([
    {
      phone: '351000000000',
      whatsapp_consent: true,
      privacy_review_status: 'legacy_unverified',
    },
  ]);
  mocks.transaction.mockResolvedValue(false);
  await expect(
    sendPrivacyReviewReminder('account', 'contact', 'owner')
  ).rejects.toThrow('sete dias');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('does not remind clients whose current preferences have already been reviewed', async () => {
  mocks.select.mockResolvedValue([
    {
      phone: '351000000000',
      whatsapp_consent: true,
      privacy_review_status: 'current',
      consent_reviewed_at: '2026-10-22T12:00:00Z',
    },
  ]);
  await expect(
    sendPrivacyReviewReminder('account', 'contact', 'owner')
  ).rejects.toThrow('já reviu');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('automatic selection requires explicit enablement, WhatsApp permission and pending legacy review', async () => {
  expect(await runPrivacyReviewReminders()).toEqual({
    checked: 0,
    sent: 0,
    failed: 0,
  });
  const sql = mocks.select.mock.calls[0][0];
  expect(sql).toContain('privacy_review_auto_enabled=TRUE');
  expect(sql).toContain('c.whatsapp_consent=TRUE');
  expect(sql).toContain("privacy_review_status='legacy_unverified'");
});
it('does not alter client consent when sending a manual reminder', async () => {
  mocks.select
    .mockResolvedValueOnce([
      {
        name: 'Cliente',
        phone: '351000000000',
        whatsapp_consent: null,
        privacy_review_status: 'legacy_unverified',
        business: 'JP Massagem',
        slug: 'jp',
      },
    ])
    .mockResolvedValueOnce([{ id: 'conversation' }]);
  expect(
    await sendPrivacyReviewReminder('account', 'contact', 'owner')
  ).toEqual({ sent: true });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: 'conversation',
      contactId: 'contact',
    })
  );
  expect(
    mocks.mutate.mock.calls.some(([sql]) => /UPDATE contacts/.test(sql))
  ).toBe(false);
});
it('uses a neutral message that allows refusal and contains the portal link', () => {
  const message = privacyReviewMessage('Cliente Demo', 'JP Massagem', 'jp');
  expect(message).toContain('permitir ou recusar');
  expect(message).toContain('/portal/jp');
  expect(message).not.toContain('senha');
});

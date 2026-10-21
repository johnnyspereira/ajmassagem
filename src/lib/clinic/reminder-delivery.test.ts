import { expect, it } from 'vitest';
import { reminderDelivery } from './reminder-delivery';
const attempt = (deliveries: unknown, created_at = '2026-10-21T12:00:00Z') => ({
  entity_id: 'a',
  action: 'message_sent',
  created_at,
  metadata: { message_action: 'reminder', deliveries },
});
it('does not infer delivery from an absent or malformed event', () => {
  expect(reminderDelivery('a', []).sent).toBe(false);
  expect(reminderDelivery('a', [{ ...attempt({}), metadata: '{' }]).sent).toBe(
    false
  );
});
it('keeps a queued WhatsApp distinct from accepted delivery', () => {
  expect(
    reminderDelivery('a', [attempt({ whatsapp: { queued: true } })])
  ).toMatchObject({ sent: false, queued: true });
});
it('uses the latest attempt for the correct appointment and reports channel results', () => {
  expect(
    reminderDelivery('a', [
      attempt({ whatsapp: { error: 'failed' } }, '2026-10-20T12:00:00Z'),
      attempt({ email: { sent: true } }),
    ])
  ).toMatchObject({ sent: true, queued: false });
  expect(
    reminderDelivery('other', [attempt({ whatsapp: { sent: true } })]).sent
  ).toBe(false);
});

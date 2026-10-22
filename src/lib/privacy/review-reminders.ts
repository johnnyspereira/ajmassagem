import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { selectRows, mutate, transaction } from '@/lib/mysql/db';
import { engineSendText } from '@/lib/automations/meta-send';
import { getPublicUrl } from '@/lib/public-url';
import { ensurePrivacyReminderSchema } from './review-reminder-schema';

export function privacyReviewMessage(
  name: string | null,
  business: string,
  slug: string
) {
  return `Olá${name ? `, ${name.split(' ')[0]}` : ''}.\n\nAqui é da ${business}. Pedimos que reveja os seus dados e preferências de privacidade no Portal 360. Pode permitir ou recusar cada opção, conforme a sua vontade.\n\nAceda ao Portal e abra Perfil → Privacidade e comunicações:\n${getPublicUrl(`/portal/${encodeURIComponent(slug)}`, 'https://jpmassagem.pt')}\n\nObrigado.`;
}
export async function sendPrivacyReviewReminder(
  accountId: string,
  contactId: string,
  userId: string
) {
  const rows = await selectRows<RowDataPacket[]>(
    `SELECT c.name,c.phone,c.whatsapp_consent,c.privacy_review_status,c.consent_reviewed_at,s.slug,a.name business FROM contacts c JOIN client_portal_access p ON p.account_id=c.account_id AND p.contact_id=c.id AND p.enabled=TRUE JOIN client_portal_settings s ON s.account_id=c.account_id AND s.enabled=TRUE JOIN accounts a ON a.id=c.account_id WHERE c.account_id=? AND c.id=? AND c.anonymized_at IS NULL LIMIT 1`,
    [accountId, contactId]
  );
  const row = rows[0];
  if (!row || !row.phone)
    throw new Error('Cliente sem acesso ativo ao Portal ou sem telefone.');
  if (row.whatsapp_consent === false || row.whatsapp_consent === 0)
    throw new Error(
      'O cliente recusou comunicações por WhatsApp. Não foi enviada mensagem.'
    );
  if (
    (row.privacy_review_status === 'current' && row.consent_reviewed_at) ||
    row.privacy_review_status === 'withdrawn'
  )
    throw new Error('O cliente já reviu ou retirou as preferências.');
  const claimed = await transaction(async (connection) => {
    await connection.execute(
      'INSERT IGNORE INTO privacy_review_reminders(account_id,contact_id) VALUES(?,?)',
      [accountId, contactId]
    );
    const [result] = await connection.execute(
      `UPDATE privacy_review_reminders SET claimed_at=UTC_TIMESTAMP(3),last_error=NULL WHERE account_id=? AND contact_id=? AND (last_sent_at IS NULL OR last_sent_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)) AND (claimed_at IS NULL OR claimed_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))`,
      [accountId, contactId]
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  });
  if (!claimed)
    throw new Error(
      'Já existe um envio recente ou uma tentativa em curso. O intervalo mínimo é de sete dias.'
    );
  try {
    const existing = await selectRows<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE account_id=? AND contact_id=? ORDER BY created_at LIMIT 1',
      [accountId, contactId]
    );
    const conversationId = existing[0]?.id || randomUUID();
    if (!existing.length)
      await mutate(
        'INSERT INTO conversations(id,account_id,contact_id,user_id) VALUES(?,?,?,?)',
        [conversationId, accountId, contactId, userId]
      );
    await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId,
      text: privacyReviewMessage(row.name, row.business, row.slug),
    });
    await mutate(
      'UPDATE privacy_review_reminders SET last_sent_at=UTC_TIMESTAMP(3),claimed_at=NULL,last_error=NULL WHERE account_id=? AND contact_id=?',
      [accountId, contactId]
    );
    return { sent: true };
  } catch (error) {
    await mutate(
      'UPDATE privacy_review_reminders SET claimed_at=NULL,last_error=? WHERE account_id=? AND contact_id=?',
      [
        error instanceof Error ? error.message.slice(0, 500) : 'Falha no envio',
        accountId,
        contactId,
      ]
    );
    throw error;
  }
}
export async function runPrivacyReviewReminders() {
  await ensurePrivacyReminderSchema();
  const rows = await selectRows<RowDataPacket[]>(
    `SELECT c.account_id,c.id,a.owner_user_id FROM contacts c JOIN accounts a ON a.id=c.account_id JOIN client_portal_access p ON p.account_id=c.account_id AND p.contact_id=c.id AND p.enabled=TRUE JOIN client_portal_settings s ON s.account_id=c.account_id AND s.enabled=TRUE AND s.privacy_review_auto_enabled=TRUE LEFT JOIN privacy_review_reminders r ON r.account_id=c.account_id AND r.contact_id=c.id WHERE (c.privacy_review_status='legacy_unverified' OR (c.privacy_review_status='current' AND c.consent_reviewed_at IS NULL)) AND c.whatsapp_consent=TRUE AND c.anonymized_at IS NULL AND (r.last_sent_at IS NULL OR r.last_sent_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)) ORDER BY r.last_sent_at LIMIT 10`
  );
  let sent = 0,
    failed = 0;
  for (const row of rows) {
    try {
      await sendPrivacyReviewReminder(
        row.account_id,
        row.id,
        row.owner_user_id
      );
      sent++;
    } catch {
      failed++;
    }
  }
  return { checked: rows.length, sent, failed };
}

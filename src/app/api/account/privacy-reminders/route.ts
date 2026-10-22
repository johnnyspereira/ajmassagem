import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows, mutate } from '@/lib/mysql/db';
import { sendPrivacyReviewReminder } from '@/lib/privacy/review-reminders';
import type { RowDataPacket } from 'mysql2';
import {
  ensurePrivacyReminderSchema,
  privacyReminderError,
} from '@/lib/privacy/review-reminder-schema';
export async function GET() {
  try {
    const { accountId } = await requireRole('admin');
    await ensurePrivacyReminderSchema();
    const [settings, clients] = await Promise.all([
      selectRows<RowDataPacket[]>(
        'SELECT privacy_review_auto_enabled FROM client_portal_settings WHERE account_id=?',
        [accountId]
      ),
      selectRows<RowDataPacket[]>(
        `SELECT c.id,c.name,c.phone,c.whatsapp_consent,c.privacy_review_status,c.consent_reviewed_at,r.last_sent_at,r.last_error FROM contacts c JOIN client_portal_access p ON p.account_id=c.account_id AND p.contact_id=c.id AND p.enabled=TRUE LEFT JOIN privacy_review_reminders r ON r.account_id=c.account_id AND r.contact_id=c.id WHERE c.account_id=? AND c.anonymized_at IS NULL ORDER BY c.name LIMIT 1000`,
        [accountId]
      ),
    ]);
    return Response.json(
      {
        enabled: Boolean(settings[0]?.privacy_review_auto_enabled),
        clients: clients.map((client) => ({
          ...client,
          whatsapp_consent:
            client.whatsapp_consent == null
              ? null
              : Boolean(client.whatsapp_consent),
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return privacyReminderError(error) || toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('admin');
    await ensurePrivacyReminderSchema();
    const body = await request.json();
    if (typeof body.enabled === 'boolean') {
      await mutate(
        'UPDATE client_portal_settings SET privacy_review_auto_enabled=? WHERE account_id=?',
        [body.enabled, accountId]
      );
      return Response.json({ ok: true });
    }
    if (typeof body.contactId !== 'string')
      return Response.json({ error: 'Selecione um cliente.' }, { status: 400 });
    try {
      return Response.json(
        await sendPrivacyReviewReminder(accountId, body.contactId, userId)
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Falha ao enviar.' },
        { status: 409 }
      );
    }
  } catch (error) {
    return privacyReminderError(error) || toErrorResponse(error);
  }
}

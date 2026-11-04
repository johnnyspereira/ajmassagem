import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';
import {
  ensureReviewLinkSchema,
  reviewLinkSchemaError,
} from '@/lib/clinic/review-link-schema';
import { googleReviewInvitation } from '@/lib/clinic/google-review-invitation';

export async function GET(request: Request) {
  try {
    const { accountId, account } = await requireRole('agent');
    const conversationId = new URL(request.url).searchParams.get(
      'conversationId'
    );
    if (!conversationId || conversationId.length > 64) {
      return Response.json({ error: 'Escolha uma conversa.' }, { status: 400 });
    }
    const contacts = await selectRows<RowDataPacket[]>(
      'SELECT c.name FROM conversations v JOIN contacts c ON c.id=v.contact_id AND c.account_id=v.account_id WHERE v.id=? AND v.account_id=? LIMIT 1',
      [conversationId, accountId]
    );
    if (!contacts.length)
      return Response.json(
        { error: 'Conversa não encontrada.' },
        { status: 404 }
      );
    await ensureReviewLinkSchema();
    const settings = await selectRows<RowDataPacket[]>(
      'SELECT review_google_url FROM clinic_communication_settings WHERE account_id=? LIMIT 1',
      [accountId]
    );
    let message: string;
    try {
      message = googleReviewInvitation(
        contacts[0].name,
        account.name || 'JP Massagem',
        settings[0]?.review_google_url
      );
    } catch {
      return Response.json(
        {
          error:
            'Configure um link Google válido em Definições → Mensagens automáticas → Link de avaliação. Depois, volte a tentar.',
        },
        { status: 409 }
      );
    }
    return Response.json(
      { message },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return reviewLinkSchemaError(error) ?? toErrorResponse(error);
  }
}

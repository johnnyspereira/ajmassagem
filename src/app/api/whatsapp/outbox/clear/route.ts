import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mutate, selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

const CONFIRMATION_PHRASE = 'CLEAR_WHATSAPP_OUTBOX';

/**
 * Cancels unsent WhatsApp jobs without deleting the message, conversation or
 * contact.  `dead` is deliberately used rather than deleting rows: it keeps a
 * clear audit trail and makes it impossible for a worker lease to send an old
 * message after a restart.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
    } | null;

    if (body?.confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: 'Confirmation phrase is required.' },
        { status: 400 }
      );
    }

    const jobs = await selectRows<(RowDataPacket & { id: string })[]>(
      `SELECT id
       FROM whatsapp_outbox
       WHERE account_id=? AND status IN ('pending','processing','failed')`,
      [ctx.accountId]
    );

    if (jobs.length === 0) {
      return NextResponse.json({ ok: true, cancelled: 0 });
    }

    // A processing lease is invalidated as well, so a worker that was stopped
    // mid-poll cannot complete the delivery after the owner clears the queue.
    await mutate(
      `UPDATE whatsapp_outbox
       SET status='dead',lease_until=NULL,worker_id=NULL,
           last_error='Cancelado manualmente pelo proprietário',
           updated_at=UTC_TIMESTAMP(3)
       WHERE account_id=? AND status IN ('pending','processing','failed')`,
      [ctx.accountId]
    );
    await mutate(
      `UPDATE messages m
       JOIN whatsapp_outbox o ON o.message_id=m.id
       SET m.status='failed'
       WHERE o.account_id=?
         AND o.status='dead'
         AND o.last_error='Cancelado manualmente pelo proprietário'`,
      [ctx.accountId]
    );

    return NextResponse.json({ ok: true, cancelled: jobs.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}

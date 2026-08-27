import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { sendLocalEmail } from '@/lib/email/smtp';
import { mutate, selectRows } from '@/lib/mysql/db';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return Response.json({ data: {}, error: null });
  const rows = await selectRows<(RowDataPacket & { id: string })[]>('SELECT id FROM app_users WHERE email=? LIMIT 1', [email]);
  if (rows[0]) {
    const token = randomBytes(32).toString('base64url');
    await mutate(`INSERT INTO app_one_time_tokens(id,user_id,token_hash,purpose,expires_at) VALUES(?,?,?,'recovery',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))`, [randomUUID(), rows[0].id, createHash('sha256').update(token).digest('hex')]);
    const url = new URL('/auth/callback', request.url); url.searchParams.set('code', token); url.searchParams.set('next', '/reset-password');
    try { await sendLocalEmail({ to: email, subject: 'Recuperar acesso ao CRM', text: `Use este link durante os próximos 30 minutos: ${url}`, html: `<p>Use o link abaixo durante os próximos 30 minutos:</p><p><a href="${url}">Definir nova senha</a></p>` }); }
    catch (cause) { console.error('[password-reset-email]', cause); }
  }
  return Response.json({ data: {}, error: null });
}

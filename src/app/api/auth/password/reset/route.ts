import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { hashRecoveryToken } from '@/lib/auth/recovery';
import { sendLocalEmail } from '@/lib/email/smtp';
import { passwordResetEmail } from '@/lib/email/templates';
import { selectRows, transaction } from '@/lib/mysql/db';
import { getPublicUrl } from '@/lib/public-url';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const clientKey = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = checkRateLimit(`password-recovery:${clientKey}`, {
    limit: 5,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.success) return rateLimitResponse(rateLimit);

  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return Response.json({ data: {}, error: null });

  const emailRateLimit = checkRateLimit(`password-recovery-email:${email}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (!emailRateLimit.success) return rateLimitResponse(emailRateLimit);

  const rows = await selectRows<(RowDataPacket & { id: string })[]>(
    'SELECT id FROM app_users WHERE email=? LIMIT 1',
    [email]
  );
  if (rows[0]) {
    const token = randomBytes(32).toString('base64url');
    await transaction(async (connection) => {
      // A newer request replaces older recovery links for this account.
      await connection.execute(
        "UPDATE app_one_time_tokens SET consumed_at=UTC_TIMESTAMP(3) WHERE user_id=? AND purpose='recovery' AND consumed_at IS NULL",
        [rows[0].id]
      );
      await connection.execute(
        `INSERT INTO app_one_time_tokens(id,user_id,token_hash,purpose,expires_at)
         VALUES(?,?,?,'recovery',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE))`,
        [randomUUID(), rows[0].id, hashRecoveryToken(token)]
      );
    });
    const url = new URL(
      getPublicUrl('/auth/callback', new URL(request.url).origin)
    );
    url.searchParams.set('code', token);
    url.searchParams.set('next', '/reset-password');
    try {
      await sendLocalEmail({
        to: email,
        profile: 'general',
        ...passwordResetEmail({ resetUrl: url.toString() }),
      });
    } catch {
      // Keep the response identical whether delivery failed or the account
      // exists, preventing account enumeration.
      console.error('[password-reset-email] delivery failed');
    }
  }
  return Response.json({ data: {}, error: null });
}

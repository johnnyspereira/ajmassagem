import { NextResponse, type NextRequest } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import {
  hashRecoveryToken,
  isRecoveryToken,
  RECOVERY_COOKIE,
  RECOVERY_TOKEN_TTL_SECONDS,
  safeInternalPath,
} from '@/lib/auth/recovery';
import { selectRows } from '@/lib/mysql/db';
import { getPublicUrl } from '@/lib/public-url';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') || '/dashboard';
  const next = safeInternalPath(rawNext, '/dashboard');

  if (!isRecoveryToken(code)) {
    const errorUrl = new URL(
      getPublicUrl('/forgot-password', requestUrl.origin)
    );
    errorUrl.searchParams.set('error', 'invalid_or_expired');
    return NextResponse.redirect(errorUrl);
  }

  const rows = await selectRows<(RowDataPacket & { id: string; user_id: string })[]>(
    `SELECT id,user_id FROM app_one_time_tokens WHERE token_hash=? AND purpose='recovery' AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 1`,
    [hashRecoveryToken(code)]
  );
  if (!rows[0]) {
    const errorUrl = new URL(
      getPublicUrl('/forgot-password', requestUrl.origin)
    );
    errorUrl.searchParams.set('error', 'invalid_or_expired');
    return NextResponse.redirect(errorUrl);
  }

  // A recovery link is not a normal authenticated session. The token remains
  // one-time until the password change transaction consumes it.
  const response = NextResponse.redirect(
    getPublicUrl(next, requestUrl.origin)
  );
  response.cookies.set(RECOVERY_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RECOVERY_TOKEN_TTL_SECONDS,
  });
  return response;
}

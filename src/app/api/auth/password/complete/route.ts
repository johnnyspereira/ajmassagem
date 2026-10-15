import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

import {
  hashRecoveryToken,
  isRecoveryToken,
  RECOVERY_COOKIE,
} from '@/lib/auth/recovery';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { transaction } from '@/lib/mysql/db';

const INVALID_RECOVERY = 'O link de recuperação é inválido ou expirou. Peça um novo link.';

interface RecoveryTokenRow extends RowDataPacket {
  user_id: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    password?: string;
    confirmation?: string;
  } | null;
  const password = body?.password ?? '';

  if (password.length < 8) {
    return Response.json(
      { error: { message: 'A palavra-passe deve ter pelo menos 8 caracteres.' } },
      { status: 400 }
    );
  }
  if (body?.confirmation !== undefined && body.confirmation !== password) {
    return Response.json(
      { error: { message: 'A confirmação não coincide com a nova palavra-passe.' } },
      { status: 400 }
    );
  }

  const token = (await cookies()).get(RECOVERY_COOKIE)?.value;
  if (!isRecoveryToken(token)) return invalidRecoveryResponse();

  // Do the expensive password derivation before opening the transaction.
  const passwordHash = await hashPassword(password);
  const tokenHash = hashRecoveryToken(token);

  try {
    await transaction(async (connection) => {
      // The conditional update is the one-time check and consume operation.
      // affectedRows must be exactly one, even if two requests race each other.
      const [consume] = await connection.execute<ResultSetHeader>(
        `UPDATE app_one_time_tokens
            SET consumed_at=UTC_TIMESTAMP(3)
          WHERE token_hash=? AND purpose='recovery'
            AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)`,
        [tokenHash]
      );
      if (consume.affectedRows !== 1) throw new Error('invalid_recovery_token');

      const [rows] = await connection.execute<RecoveryTokenRow[]>(
        "SELECT user_id FROM app_one_time_tokens WHERE token_hash=? AND purpose='recovery' LIMIT 1",
        [tokenHash]
      );
      const recovery = rows[0];
      if (!recovery) throw new Error('invalid_recovery_token');

      await connection.execute('UPDATE app_users SET password_hash=? WHERE id=?', [
        passwordHash,
        recovery.user_id,
      ]);
      // Password recovery invalidates every previously authenticated device.
      await connection.execute('DELETE FROM app_sessions WHERE user_id=?', [
        recovery.user_id,
      ]);
      // Any other recovery email becomes unusable as well.
      await connection.execute(
        "UPDATE app_one_time_tokens SET consumed_at=UTC_TIMESTAMP(3) WHERE user_id=? AND purpose='recovery' AND consumed_at IS NULL",
        [recovery.user_id]
      );
    });
  } catch {
    return invalidRecoveryResponse();
  }

  const response = NextResponse.json({ data: { completed: true }, error: null });
  response.cookies.set(RECOVERY_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

function invalidRecoveryResponse() {
  const response = NextResponse.json(
    { error: { message: INVALID_RECOVERY } },
    { status: 400 }
  );
  response.cookies.set(RECOVERY_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

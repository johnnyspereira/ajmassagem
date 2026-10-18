import type { RowDataPacket } from 'mysql2';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { db } from '@/lib/mysql/db';

export const runtime = 'nodejs';

/** Read-only aggregation: do not download the full appointment history to find the last visit. */
export async function POST(request: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const body = await request.json().catch(() => null);
    if (
      !Array.isArray(body?.contactIds) ||
      body.contactIds.length > 2000 ||
      body.contactIds.some(
        (id: unknown) =>
          typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id)
      )
    ) {
      return Response.json(
        { error: 'Lista de contactos inválida.' },
        { status: 400 }
      );
    }
    const ids = [...new Set<string>(body.contactIds)];
    if (!ids.length) return Response.json({ data: [] });
    const [rows] = await db().execute<RowDataPacket[]>(
      `SELECT contact_id, MAX(scheduled_start) AS last_session, COUNT(*) AS total_sessions
       FROM clinic_appointments
       WHERE account_id = ? AND status = 'completed' AND scheduled_start <= UTC_TIMESTAMP(3)
         AND contact_id IN (${ids.map(() => '?').join(',')})
       GROUP BY contact_id`,
      [accountId, ...ids]
    );
    return Response.json(
      { data: rows },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

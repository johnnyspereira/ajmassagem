import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import { findAvailabilityConflicts } from '@/lib/clinic/agenda-availability';

export const runtime = 'nodejs';
const validId = (id: unknown) =>
  typeof id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(id);
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('owner');
    const body = await request.json().catch(() => null);
    const start = new Date(body?.starts_at);
    const end = new Date(body?.ends_at);
    if (
      !body ||
      typeof body.starts_at !== 'string' ||
      typeof body.ends_at !== 'string' ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      (body.id != null && !validId(body.id)) ||
      [body.professional_profile_id, body.room_id].some(
        (id) => id != null && !validId(id)
      ) ||
      typeof body.is_online_block !== 'boolean' ||
      (body.reason != null &&
        (typeof body.reason !== 'string' || body.reason.length > 2000))
    )
      return Response.json(
        { error: 'Reveja os dados e o período do bloqueio.' },
        { status: 400 }
      );
    const stamp = (date: Date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');
    const result = await transaction(async (connection) => {
      const [accounts] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM accounts WHERE id=? FOR UPDATE',
        [accountId]
      );
      if (!accounts.length)
        return { error: 'Conta indisponível.', status: 404 };
      for (const [table, id] of [
        ['profiles', body.professional_profile_id],
        ['clinic_rooms', body.room_id],
      ]) {
        if (!id) continue;
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM ${table} WHERE id=? AND account_id=?`,
          [id, accountId]
        );
        if (!rows.length)
          return { error: 'Profissional ou sala indisponível.', status: 400 };
      }
      const [previous] = body.id
        ? await connection.execute<RowDataPacket[]>(
            'SELECT starts_at,ends_at,external_calendar_feed_id FROM clinic_time_blocks WHERE id=? AND account_id=? FOR UPDATE',
            [body.id, accountId]
          )
        : [[]];
      if (body.id && (!previous[0] || previous[0].external_calendar_feed_id))
        return { error: 'Bloqueio indisponível para alteração.', status: 404 };
      const [blocks] = await connection.execute<RowDataPacket[]>(
        'SELECT id,starts_at,ends_at,professional_profile_id,room_id FROM clinic_time_blocks WHERE account_id=? AND starts_at<? AND ends_at>? FOR UPDATE',
        [accountId, stamp(end), stamp(start)]
      );
      const conflicts = findAvailabilityConflicts(
        blocks.map((block) => ({
          id: block.id,
          kind: 'time_block',
          startsAt: new Date(block.starts_at).toISOString(),
          endsAt: new Date(block.ends_at).toISOString(),
          professionalId: block.professional_profile_id,
          roomId: block.room_id,
        })),
        {
          startsAt: start,
          endsAt: end,
          professionalId: body.professional_profile_id,
          roomId: body.room_id,
          excludeBlockId: body.id,
          globalResource: !body.professional_profile_id && !body.room_id,
        }
      );
      if (conflicts.length)
        return {
          error:
            'Já existe um bloqueio nesse período. Edite o bloqueio existente.',
          status: 409,
        };
      const id = body.id || randomUUID();
      const values = [
        body.professional_profile_id || null,
        body.room_id || null,
        stamp(start),
        stamp(end),
        body.reason?.trim() || null,
        body.is_online_block,
      ];
      if (body.id)
        await connection.execute(
          'UPDATE clinic_time_blocks SET professional_profile_id=?,room_id=?,starts_at=?,ends_at=?,reason=?,is_online_block=? WHERE id=? AND account_id=?',
          [...values, id, accountId]
        );
      else
        await connection.execute(
          'INSERT INTO clinic_time_blocks(professional_profile_id,room_id,starts_at,ends_at,reason,is_online_block,id,account_id,user_id) VALUES(?,?,?,?,?,?,?,?,?)',
          [...values, id, accountId, userId]
        );
      await connection.execute(
        'INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,metadata,old_starts_at,old_ends_at,new_starts_at,new_ends_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          randomUUID(),
          accountId,
          userId,
          'time_block',
          id,
          body.id ? 'updated' : 'created',
          body.reason?.trim() || null,
          JSON.stringify({
            owner_override: true,
            existing_appointments_preserved: true,
          }),
          previous[0]?.starts_at || null,
          previous[0]?.ends_at || null,
          stamp(start),
          stamp(end),
        ]
      );
      return { id };
    });
    if ('error' in result)
      return Response.json({ error: result.error }, { status: result.status });
    return Response.json(
      { id: result.id },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

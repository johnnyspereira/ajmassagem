import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { db, transaction } from '@/lib/mysql/db';
import {
  DEFAULT_LEAD_SETTINGS,
  LEAD_STATUSES,
  parseLeadSettings,
} from '@/lib/contacts/lead-workflow';

export const runtime = 'nodejs';
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
const bad = (message = 'Dados de acompanhamento inválidos.') =>
  Response.json({ error: message }, { status: 400 });
const json = (value: unknown) =>
  Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });
function fail(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ER_NO_SUCH_TABLE'
  )
    return Response.json(
      {
        error:
          'A base de acompanhamento ainda não está instalada. Reinicie a aplicação no cPanel para aplicar a atualização da base de dados.',
      },
      { status: 503 }
    );
  return toErrorResponse(error);
}
async function settings(accountId: string) {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT recovery_days,followup_days,templates FROM lead_workflow_settings WHERE account_id=?',
    [accountId]
  );
  const row = rows[0];
  return row
    ? parseLeadSettings({
        recoveryDays: row.recovery_days,
        followupDays: row.followup_days,
        templates:
          typeof row.templates === 'string'
            ? JSON.parse(row.templates)
            : row.templates,
      }) || DEFAULT_LEAD_SETTINGS
    : DEFAULT_LEAD_SETTINGS;
}
async function contactExists(accountId: string, contactId: string) {
  const [rows] = await db().execute<RowDataPacket[]>(
    'SELECT id FROM contacts WHERE account_id=? AND id=?',
    [accountId, contactId]
  );
  return rows.length > 0;
}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (body?.action === 'load') {
      const { accountId } = await getCurrentAccount();
      if (
        !Array.isArray(body.contactIds) ||
        body.contactIds.length > 2000 ||
        body.contactIds.some((id: unknown) => !validId(id))
      )
        return bad();
      const ids = [...new Set<string>(body.contactIds)];
      const [items] = ids.length
        ? await db().execute<RowDataPacket[]>(
            `SELECT contact_id,status,next_followup_at,last_contacted_at,notes,updated_at FROM lead_followups WHERE account_id=? AND contact_id IN (${ids.map(() => '?').join(',')})`,
            [accountId, ...ids]
          )
        : [[]];
      return json({ settings: await settings(accountId), items });
    }
    const { accountId, userId } = await requireRole('agent');
    if (body?.action !== 'prepare-chat' || !validId(body.contactId))
      return bad();
    if (!(await contactExists(accountId, body.contactId)))
      return Response.json(
        { error: 'Contacto não encontrado.' },
        { status: 404 }
      );
    const id = await transaction(async (connection) => {
      // The account/contact unique key makes repeated clicks converge on one conversation.
      await connection.execute(
        'INSERT INTO conversations(id,account_id,user_id,contact_id,status,unread_count) VALUES(?,?,?,?,?,0) ON DUPLICATE KEY UPDATE id=id',
        [randomUUID(), accountId, userId, body.contactId, 'open']
      );
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM conversations WHERE account_id=? AND contact_id=? LIMIT 1',
        [accountId, body.contactId]
      );
      return rows[0]?.id;
    });
    return json({ conversationId: id });
  } catch (error) {
    return fail(error);
  }
}
export async function GET(request: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const id = new URL(request.url).searchParams.get('contactId');
    if (!validId(id)) return bad();
    if (!(await contactExists(accountId, id)))
      return Response.json(
        { error: 'Contacto não encontrado.' },
        { status: 404 }
      );
    const [activities] = await db().execute<RowDataPacket[]>(
      'SELECT id,status,contacted,next_followup_at,notes,created_at FROM lead_followup_activities WHERE account_id=? AND contact_id=? ORDER BY created_at DESC,id DESC LIMIT 30',
      [accountId, id]
    );
    return json({ activities });
  } catch (error) {
    return fail(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const value = parseLeadSettings(await request.json().catch(() => null));
    if (!value)
      return bad('Reveja os prazos, as mensagens e as variáveis indicadas.');
    await db().execute(
      'INSERT INTO lead_workflow_settings(account_id,recovery_days,followup_days,templates,updated_by) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE recovery_days=VALUES(recovery_days),followup_days=VALUES(followup_days),templates=VALUES(templates),updated_by=VALUES(updated_by)',
      [
        accountId,
        value.recoveryDays,
        value.followupDays,
        JSON.stringify(value.templates),
        userId,
      ]
    );
    return json({ settings: value });
  } catch (error) {
    return fail(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const body = await request.json().catch(() => null);
    if (
      !body ||
      !validId(body.contactId) ||
      typeof body.status !== 'string' ||
      !Object.hasOwn(LEAD_STATUSES, body.status) ||
      typeof body.notes !== 'string' ||
      body.notes.length > 3000 ||
      typeof body.contacted !== 'boolean'
    )
      return bad();
    const due =
      body.nextFollowupAt === null
        ? null
        : typeof body.nextFollowupAt === 'string' &&
            /^\d{4}-\d\d-\d\dT.*Z$/.test(body.nextFollowupAt) &&
            Number.isFinite(Date.parse(body.nextFollowupAt))
          ? new Date(body.nextFollowupAt)
          : undefined;
    if (due === undefined) return bad('Escolha uma data de seguimento válida.');
    const updated = await transaction(async (connection) => {
      const [contacts] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM contacts WHERE account_id=? AND id=? FOR UPDATE',
        [accountId, body.contactId]
      );
      if (!contacts.length) return null;
      const terminal = ['scheduled', 'not_interested'].includes(body.status);
      const next = terminal ? null : due;
      await connection.execute(
        'INSERT INTO lead_followups(account_id,contact_id,status,next_followup_at,last_contacted_at,notes,updated_by) VALUES(?,?,?,?,IF(?,UTC_TIMESTAMP(3),NULL),?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),next_followup_at=VALUES(next_followup_at),last_contacted_at=IF(?,UTC_TIMESTAMP(3),last_contacted_at),notes=VALUES(notes),updated_by=VALUES(updated_by)',
        [
          accountId,
          body.contactId,
          body.status,
          next,
          body.contacted,
          body.notes.trim(),
          userId,
          body.contacted,
        ]
      );
      await connection.execute(
        'INSERT INTO lead_followup_activities(id,account_id,contact_id,actor_user_id,status,contacted,next_followup_at,notes) VALUES(?,?,?,?,?,?,?,?)',
        [
          randomUUID(),
          accountId,
          body.contactId,
          userId,
          body.status,
          body.contacted,
          next,
          body.notes.trim(),
        ]
      );
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT contact_id,status,next_followup_at,last_contacted_at,notes,updated_at FROM lead_followups WHERE account_id=? AND contact_id=?',
        [accountId, body.contactId]
      );
      return rows[0];
    });
    return updated
      ? json({ item: updated })
      : Response.json({ error: 'Contacto não encontrado.' }, { status: 404 });
  } catch (error) {
    return fail(error);
  }
}

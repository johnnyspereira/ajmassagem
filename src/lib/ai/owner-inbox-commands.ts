import { randomInt, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { selectRows, transaction } from '@/lib/mysql/db';

type CommandContext = { accountId: string; userId: string; contactId: string; conversationId: string; phone: string; text: string };
type PendingRow = RowDataPacket & { id: string; command_type: 'block_time' | 'unblock_time'; payload: string; confirmation_code: string };

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const clean = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const digits = (value: string) => value.replace(/\D/g, '');

function lisbonDate(year: number, month: number, day: number, hour: number, minute: number) {
  const expected = Date.UTC(year, month - 1, day, hour, minute);
  let result = expected;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(result));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    result += expected - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  }
  return new Date(result);
}

function format(value: Date) {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
}

function parseBlock(text: string) {
  const normalized = clean(text);
  const iso = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const named = normalized.match(/(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(20\d{2}))?/);
  const numeric = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  const today = new Date();
  let year: number; let month: number; let day: number;
  if (iso) [, year, month, day] = iso.map(Number) as unknown as [string, number, number, number];
  else if (named && MONTHS[named[2]]) { day = Number(named[1]); month = MONTHS[named[2]]; year = Number(named[3] ?? today.getFullYear()); }
  else if (numeric) { day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3] ?? today.getFullYear()); }
  else return null;
  const times = [...normalized.matchAll(/\b([01]?\d|2[0-3])\s*(?:[:h]\s*([0-5]\d))\b/g)];
  if (times.length < 2) return null;
  const start = lisbonDate(year, month, day, Number(times[0][1]), Number(times[0][2]));
  const end = lisbonDate(year, month, day, Number(times[1][1]), Number(times[1][2]));
  if (Number.isNaN(start.getTime()) || end <= start) return null;
  return { start, end };
}

export async function handleOwnerInboxCommand(input: CommandContext): Promise<string | null> {
  const owner = await selectRows<(RowDataPacket & { enabled: number; authorized_phone: string })[]>(
    'SELECT enabled,authorized_phone FROM ai_owner_command_settings WHERE account_id=? LIMIT 1', [input.accountId]
  );
  if (!owner[0]?.enabled || digits(owner[0].authorized_phone) !== digits(input.phone)) return null;
  const text = clean(input.text);
  const confirmation = text.match(/^confirmar\s+(\d{6})\b/);
  if (confirmation) return confirm(input, confirmation[1]);
  if (/\b(bloqueios|listar bloqueios|horarios bloqueados)\b/.test(text)) return listBlocks(input.accountId);
  const isUnblock = /\b(desbloquear|remover bloqueio|apagar bloqueio)\b/.test(text);
  const isBlock = /\b(bloquear|bloqueio)\b/.test(text);
  if (!isBlock && !isUnblock) return null;
  const range = parseBlock(input.text);
  if (!range) return 'Não consegui identificar a data e as duas horas. Exemplo: “Bloquear 10 de setembro de 2026 das 15:00 até às 20:00”.';
  const code = String(randomInt(100000, 1000000));
  const type = isUnblock ? 'unblock_time' : 'block_time';
  await transaction(async (connection) => {
    await connection.execute("UPDATE ai_owner_command_requests SET status='expired' WHERE account_id=? AND contact_id=? AND status='pending'", [input.accountId, input.contactId]);
    await connection.execute('INSERT INTO ai_owner_command_requests(id,account_id,contact_id,conversation_id,command_type,payload,confirmation_code,expires_at) VALUES(?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))', [randomUUID(), input.accountId, input.contactId, input.conversationId, type, JSON.stringify({ startsAt: range.start.toISOString(), endsAt: range.end.toISOString() }), code]);
  });
  const action = isUnblock ? 'desbloquear' : 'bloquear';
  return `Vou ${action} a agenda geral de ${format(range.start)} até ${format(range.end)}. Para confirmar, responda: CONFIRMAR ${code}`;
}

async function confirm(input: CommandContext, code: string) {
  const rows = await selectRows<PendingRow[]>('SELECT id,command_type,payload,confirmation_code FROM ai_owner_command_requests WHERE account_id=? AND contact_id=? AND status=\'pending\' AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 1', [input.accountId, input.contactId]);
  const request = rows[0];
  if (!request || request.confirmation_code !== code) return 'Não existe um comando pendente com esse código. Envie o comando novamente.';
  const payload = JSON.parse(request.payload) as { startsAt: string; endsAt: string };
  if (request.command_type === 'block_time') {
    await transaction(async (connection) => {
      const blockId = randomUUID();
      await connection.execute('INSERT INTO clinic_time_blocks(id,account_id,user_id,starts_at,ends_at,reason,is_online_block) VALUES(?,?,?,?,?,?,TRUE)', [blockId, input.accountId, input.userId, new Date(payload.startsAt), new Date(payload.endsAt), 'Bloqueado por comando privado do proprietário']);
      await connection.execute("INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,new_start,new_end) VALUES(?,?,?,?,?,'created',?,?,?)", [randomUUID(), input.accountId, input.userId, 'time_block', blockId, 'Bloqueado por comando privado do proprietário', new Date(payload.startsAt), new Date(payload.endsAt)]);
      await connection.execute("UPDATE ai_owner_command_requests SET status='confirmed',confirmed_at=UTC_TIMESTAMP(3),executed_at=UTC_TIMESTAMP(3) WHERE id=?", [request.id]);
    });
    return `✓ Agenda bloqueada de ${format(new Date(payload.startsAt))} até ${format(new Date(payload.endsAt))}. O Portal 360 não mostrará esse horário.`;
  }
  const result = await transaction(async (connection) => {
    const [deleted] = await connection.execute<import('mysql2').ResultSetHeader>('DELETE FROM clinic_time_blocks WHERE account_id=? AND starts_at=? AND ends_at=? AND reason=\'Bloqueado por comando privado do proprietário\'', [input.accountId, new Date(payload.startsAt), new Date(payload.endsAt)]);
    await connection.execute("UPDATE ai_owner_command_requests SET status='confirmed',confirmed_at=UTC_TIMESTAMP(3),executed_at=UTC_TIMESTAMP(3) WHERE id=?", [request.id]);
    return deleted.affectedRows;
  });
  return result ? `✓ Bloqueio removido de ${format(new Date(payload.startsAt))} até ${format(new Date(payload.endsAt))}.` : 'Não encontrei um bloqueio criado por comando privado nesse período.';
}

async function listBlocks(accountId: string) {
  const blocks = await selectRows<(RowDataPacket & { starts_at: Date; ends_at: Date; reason: string | null })[]>('SELECT starts_at,ends_at,reason FROM clinic_time_blocks WHERE account_id=? AND ends_at>=UTC_TIMESTAMP(3) ORDER BY starts_at ASC LIMIT 8', [accountId]);
  if (!blocks.length) return 'Não existem bloqueios futuros na agenda.';
  return `Bloqueios futuros:\n${blocks.map((block) => `• ${format(new Date(block.starts_at))}–${new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(block.ends_at))}${block.reason ? ` — ${block.reason}` : ''}`).join('\n')}`;
}

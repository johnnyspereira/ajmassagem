import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { selectRows, transaction } from '@/lib/mysql/db';

type Slot = { startsAt: string; endsAt: string; label: string };

type AppointmentRow = RowDataPacket & {
  id: string;
  scheduled_start: Date | string;
  scheduled_end: Date | string;
  professional_profile_id: string | null;
  room_id: string | null;
  duration_minutes: number | string | null;
  service_name: string | null;
  professional_name: string | null;
  working_hours: string | Record<string, unknown> | null;
};

type AgendaEventRow = RowDataPacket & {
  id: string;
  entity_id: string;
  metadata: string | Record<string, unknown>;
  created_at: Date | string;
};

const RESCHEDULE_WORDS = /\b(reagendar|remarcar|alterar|mudar)(?:\s+(?:a|o|de|horario|horário|data))?\b/i;
const TIME_ZONE = 'Europe/Lisbon';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function metadata(value: AgendaEventRow['metadata']) {
  if (typeof value === 'object' && value) return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function workingHours(value: AppointmentRow['working_hours']) {
  if (typeof value === 'object' && value) return value as Record<string, unknown>;
  try {
    return JSON.parse(String(value ?? '{}')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function localParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')) };
}

function localDate(value: Date) {
  const part = localParts(value);
  return `${part.year}-${String(part.month).padStart(2, '0')}-${String(part.day).padStart(2, '0')}`;
}

// Converts Lisbon wall time into an instant. The small second pass accounts for
// the UTC offset changing on daylight-saving transition days.
function LisbonDate(date: string, hour: number, minute: number) {
  const [year, month, day] = date.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desired);
  const first = localParts(candidate);
  candidate = new Date(candidate.getTime() + (desired - Date.UTC(first.year, first.month - 1, first.day, first.hour, first.minute)));
  const second = localParts(candidate);
  return new Date(candidate.getTime() + (desired - Date.UTC(second.year, second.month - 1, second.day, second.hour, second.minute)));
}

function clockMinutes(value: unknown, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes <= 59 ? hours * 60 + minutes : fallback;
}

function formatSlot(slot: Slot) {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: TIME_ZONE,
    weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(new Date(slot.startsAt));
}

function isRescheduleRequest(message: string) {
  return RESCHEDULE_WORDS.test(message.normalize('NFD').replace(/\p{Diacritic}/gu, ''));
}

function selectedOption(message: string) {
  const normalized = message.trim().toLowerCase();
  const match = /^(?:opcao|opção)?\s*([1-3])(?:\s*[.!])?$/.exec(normalized);
  return match ? Number(match[1]) : null;
}

async function pendingAppointment(accountId: string, contactId: string) {
  const rows = await selectRows<AppointmentRow[]>(
    `SELECT a.id,a.scheduled_start,a.scheduled_end,a.professional_profile_id,a.room_id,
       s.duration_minutes,s.name AS service_name,p.full_name AS professional_name,p.working_hours
     FROM clinic_appointments a
     LEFT JOIN clinic_services s ON s.id=a.service_id
     LEFT JOIN profiles p ON p.id=a.professional_profile_id
     WHERE a.account_id=? AND a.contact_id=?
       AND a.status NOT IN ('cancelled','no_show','completed')
       AND a.scheduled_start>=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)
     ORDER BY CASE WHEN a.confirmation_status='pending' THEN 0 ELSE 1 END,a.scheduled_start ASC
     LIMIT 1`,
    [accountId, contactId]
  );
  return rows[0] ?? null;
}

async function findSlots(accountId: string, appointment: AppointmentRow): Promise<Slot[]> {
  const duration = Math.max(15, Number(appointment.duration_minutes ?? 60));
  const start = new Date();
  start.setMinutes(start.getMinutes() + 30, 0, 0);
  const until = new Date(start.getTime() + 21 * 24 * 60 * 60 * 1000);
  const [appointments, blocks] = await Promise.all([
    selectRows<(RowDataPacket & { scheduled_start: Date | string; scheduled_end: Date | string; professional_profile_id: string | null; room_id: string | null })[]>(
      `SELECT scheduled_start,scheduled_end,professional_profile_id,room_id FROM clinic_appointments
       WHERE account_id=? AND id<>? AND status NOT IN ('cancelled','no_show')
         AND scheduled_start<? AND scheduled_end>?`,
      [accountId, appointment.id, until, start]
    ),
    selectRows<(RowDataPacket & { starts_at: Date | string; ends_at: Date | string; professional_profile_id: string | null; room_id: string | null })[]>(
      `SELECT starts_at,ends_at,professional_profile_id,room_id FROM clinic_time_blocks
       WHERE account_id=? AND starts_at<? AND ends_at>?`,
      [accountId, until, start]
    ),
  ]);
  const hours = workingHours(appointment.working_hours);
  const slots: Slot[] = [];
  for (let offset = 0; offset < 21 && slots.length < 3; offset += 1) {
    const day = new Date(start.getTime() + offset * 86_400_000);
    const date = localDate(day);
    const dayKey = DAY_KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const configured = hours[dayKey] as { enabled?: boolean; start?: string; end?: string; breakStart?: string; breakEnd?: string } | undefined;
    if (configured?.enabled === false) continue;
    const open = clockMinutes(configured?.start, 9 * 60);
    const close = clockMinutes(configured?.end, 21 * 60);
    const breakStart = clockMinutes(configured?.breakStart, -1);
    const breakEnd = clockMinutes(configured?.breakEnd, -1);
    for (let minute = open; minute + duration <= close && slots.length < 3; minute += 30) {
      if (breakStart >= 0 && breakEnd >= 0 && minute < breakEnd && minute + duration > breakStart) continue;
      const candidate = LisbonDate(date, Math.floor(minute / 60), minute % 60);
      const candidateEnd = new Date(candidate.getTime() + duration * 60_000);
      if (candidate <= start) continue;
      const conflict = appointments.some((item) => {
        const shared = (appointment.professional_profile_id && item.professional_profile_id === appointment.professional_profile_id) || (appointment.room_id && item.room_id === appointment.room_id);
        return shared && new Date(item.scheduled_start) < candidateEnd && new Date(item.scheduled_end) > candidate;
      }) || blocks.some((item) => {
        const shared = (!item.professional_profile_id && !item.room_id) ||
          (appointment.professional_profile_id && item.professional_profile_id === appointment.professional_profile_id) ||
          (appointment.room_id && item.room_id === appointment.room_id);
        return shared && new Date(item.starts_at) < candidateEnd && new Date(item.ends_at) > candidate;
      });
      if (!conflict) slots.push({ startsAt: candidate.toISOString(), endsAt: candidateEnd.toISOString(), label: formatSlot({ startsAt: candidate.toISOString(), endsAt: candidateEnd.toISOString(), label: '' }) });
    }
  }
  return slots;
}

async function latestOptionsEvent(accountId: string, contactId: string) {
  const rows = await selectRows<AgendaEventRow[]>(
    `SELECT e.id,e.entity_id,e.metadata,e.created_at FROM clinic_agenda_events e
     JOIN clinic_appointments a ON a.id=e.entity_id AND a.account_id=e.account_id
     WHERE e.account_id=? AND a.contact_id=? AND e.entity_type='appointment'
       AND e.action='status_changed' AND e.created_at>=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 DAY)
     ORDER BY e.created_at DESC LIMIT 20`,
    [accountId, contactId]
  );
  return rows.find((row) => {
    const value = metadata(row.metadata);
    return value.kind === 'whatsapp_reschedule' && value.state === 'options_sent' && Array.isArray(value.options);
  }) ?? null;
}

export async function handleWhatsAppRescheduleReply(input: {
  accountId: string;
  contactId: string;
  messageText: string;
  conversationId: string;
  sourceMessageId: string;
}) {
  const choice = selectedOption(input.messageText);
  if (choice) {
    const event = await latestOptionsEvent(input.accountId, input.contactId);
    const eventMetadata = event ? metadata(event.metadata) : null;
    const option = eventMetadata?.options && Array.isArray(eventMetadata.options)
      ? eventMetadata.options[choice - 1] as Slot | undefined : undefined;
    if (!event || !option?.startsAt || !option.endsAt) return null;
    await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,metadata,old_starts_at,old_ends_at,new_starts_at,new_ends_at)
         SELECT ?,?,NULL,'appointment',a.id,'status_changed',?,CAST(? AS JSON),a.scheduled_start,a.scheduled_end,?,?
         FROM clinic_appointments a WHERE a.id=? AND a.account_id=?`,
        [randomUUID(), input.accountId, `Cliente escolheu a opção ${choice}; aguarda aprovação do profissional.`, JSON.stringify({
          kind: 'whatsapp_reschedule', state: 'awaiting_professional', selected_option: choice,
          selected_slot: option, contact_id: input.contactId, conversation_id: input.conversationId,
          source_message_id: input.sourceMessageId, options_event_id: event.id,
        }), option.startsAt, option.endsAt, event.entity_id, input.accountId]
      );
    });
    return { appointmentId: event.entity_id, replyText: `Recebemos a sua preferência: *${formatSlot(option)}*. O pedido foi enviado ao profissional. Assim que for aprovado, confirmamos por aqui.` };
  }

  if (!isRescheduleRequest(input.messageText)) return null;
  const appointment = await pendingAppointment(input.accountId, input.contactId);
  if (!appointment) return null;
  const options = await findSlots(input.accountId, appointment);
  if (!options.length) {
    return { appointmentId: appointment.id, replyText: 'Recebemos o seu pedido de reagendamento. Neste momento não encontramos horários disponíveis próximos; a equipa irá contactar consigo.' };
  }
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE clinic_appointments SET confirmation_status='declined',confirmation_response_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3)
       WHERE id=? AND account_id=?`, [appointment.id, input.accountId]
    );
    await connection.execute(
      `INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,metadata,old_starts_at,old_ends_at,new_starts_at,new_ends_at)
       VALUES(?,?,NULL,'appointment',?,'status_changed',?,CAST(? AS JSON),?,?,?,?)`,
      [randomUUID(), input.accountId, appointment.id, 'Cliente pediu reagendamento pelo WhatsApp; opções enviadas.', JSON.stringify({
        kind: 'whatsapp_reschedule', state: 'options_sent', options,
        contact_id: input.contactId, conversation_id: input.conversationId, source_message_id: input.sourceMessageId,
      }), appointment.scheduled_start, appointment.scheduled_end, appointment.scheduled_start, appointment.scheduled_end]
    );
  });
  const service = appointment.service_name ? ` para *${appointment.service_name}*` : '';
  const professional = appointment.professional_name ? ` com *${appointment.professional_name}*` : '';
  return {
    appointmentId: appointment.id,
    replyText: `Claro! Temos estas opções${service}${professional}:\n\n${options.map((slot, index) => `*${index + 1}.* ${formatSlot(slot)}`).join('\n')}\n\nResponda apenas com *1*, *2* ou *3*. A alteração ficará pendente de confirmação do profissional.`,
  };
}

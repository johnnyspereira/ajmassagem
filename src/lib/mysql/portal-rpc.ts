import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';

type PortalUser = { id: string; email: string } | null;

type WorkingDay = {
  enabled?: boolean;
  start?: string;
  end?: string;
  breakStart?: string;
  breakEnd?: string;
};

const PORTUGAL_DAY_KEYS: Record<string, string> = {
  Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
};

function timeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

/**
 * The portal route runs in the cPanel/MySQL runtime too.  Date#getHours()
 * would use the server timezone there, so always derive the professional's
 * local weekday and time through Intl with the account timezone.
 */
function localScheduleParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    dayKey: PORTUGAL_DAY_KEYS[value('weekday')] ?? '',
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
    date: new Intl.DateTimeFormat('en-CA', { timeZone }).format(at),
  };
}

function parseWorkingHours(value: unknown): Record<string, WorkingDay> {
  if (value && typeof value === 'object') return value as Record<string, WorkingDay>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, WorkingDay>;
    } catch {
      // A malformed legacy preference must never silently create a booking.
    }
  }
  return {};
}

export async function executePortalRpc(name: string, args: Record<string, unknown>, user: PortalUser): Promise<{ data: unknown; error: { message: string } | null }> {
  if (!user) return { data: null, error: { message: 'Authentication required.' } };
  try {
    if (name === 'portal_cancel_appointment') {
      const result = await mutate(
        `UPDATE clinic_appointments a JOIN client_portal_access p ON p.account_id=a.account_id AND p.contact_id=a.contact_id
          JOIN client_portal_settings s ON s.account_id=p.account_id
          SET a.status='cancelled',a.cancelled_at=UTC_TIMESTAMP(3),a.updated_at=UTC_TIMESTAMP(3)
          WHERE a.id=? AND LOWER(s.slug)=LOWER(?) AND p.auth_user_id=? AND a.status IN ('scheduled','confirmed')`,
        [String(args.p_appointment_id), String(args.p_slug), user.id]
      );
      if (!result.affectedRows) throw new Error('Appointment not found or cannot be cancelled.');
      return { data: true, error: null };
    }
    if (name === 'portal_create_appointment') {
      const rows = await selectRows<(RowDataPacket & { account_id: string; contact_id: string; timezone: string | null })[]>(
        `SELECT p.account_id,p.contact_id,a.timezone FROM client_portal_access p
          JOIN client_portal_settings s ON s.account_id=p.account_id
          JOIN accounts a ON a.id=p.account_id
          WHERE p.auth_user_id=? AND LOWER(s.slug)=LOWER(?) AND s.enabled=TRUE AND s.booking_enabled=TRUE LIMIT 1`,
        [user.id, String(args.p_slug)]
      );
      const access = rows[0]; if (!access) throw new Error('Portal booking is unavailable.');
      const id = randomUUID();
      await transaction(async (connection) => {
        const [services] = await connection.execute<(RowDataPacket & { duration_minutes: number; price: number })[]>(
          'SELECT duration_minutes,price FROM clinic_services WHERE id=? AND account_id=? AND is_active=TRUE AND internal_booking_enabled=TRUE LIMIT 1',
          [String(args.p_service_id), access.account_id]
        );
        const service = services[0]; if (!service) throw new Error('Service unavailable.');
        const start = new Date(String(args.p_scheduled_start)); if (Number.isNaN(start.getTime())) throw new Error('Invalid appointment time.');
        const end = new Date(start.getTime() + service.duration_minutes * 60_000);
        if (start <= new Date()) throw new Error('Selected time must be in the future.');

        const [professionals] = await connection.execute<
          (RowDataPacket & { working_hours: string | Record<string, WorkingDay> | null })[]
        >(
          `SELECT working_hours FROM profiles
           WHERE id=? AND account_id=? AND is_professional=TRUE
             AND professional_show_online=TRUE AND online_booking_blocked=FALSE
           LIMIT 1 FOR UPDATE`,
          [String(args.p_professional_profile_id), access.account_id]
        );
        const professional = professionals[0];
        if (!professional) throw new Error('Professional is not available online.');
        const timeZone = access.timezone || 'Europe/Lisbon';
        const startLocal = localScheduleParts(start, timeZone);
        const endLocal = localScheduleParts(end, timeZone);
        const hours = parseWorkingHours(professional.working_hours)[startLocal.dayKey];
        const opening = timeToMinutes(hours?.start);
        const closing = timeToMinutes(hours?.end);
        // No working-day rule is an unavailable day, never a fallback to 21:00.
        if (!hours || hours.enabled !== true || opening === null || closing === null) {
          throw new Error('Professional does not work on the selected day.');
        }
        if (
          startLocal.date !== endLocal.date ||
          startLocal.minutes < opening ||
          endLocal.minutes > closing
        ) {
          throw new Error('Selected time is outside the professional working hours.');
        }
        const breakStart = timeToMinutes(hours.breakStart);
        const breakEnd = timeToMinutes(hours.breakEnd);
        if (
          breakStart !== null && breakEnd !== null &&
          startLocal.minutes < breakEnd && endLocal.minutes > breakStart
        ) {
          throw new Error('Selected time overlaps the professional break.');
        }
        const [conflicts] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM clinic_appointments WHERE account_id=? AND professional_profile_id=? AND status IN ('scheduled','confirmed','in_progress')
            AND scheduled_start < ? AND scheduled_end > ? LIMIT 1`,
          [access.account_id, String(args.p_professional_profile_id), end, start]
        );
        if (conflicts.length) throw new Error('The selected time is no longer available.');
        const [blocks] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM clinic_time_blocks
           WHERE account_id=? AND (professional_profile_id=? OR professional_profile_id IS NULL)
             AND starts_at < ? AND ends_at > ? LIMIT 1`,
          [access.account_id, String(args.p_professional_profile_id), end, start]
        );
        if (blocks.length) throw new Error('Selected time is blocked in the agenda.');
        await connection.execute(
          `INSERT INTO clinic_appointments(id,account_id,contact_id,service_id,professional_profile_id,scheduled_start,scheduled_end,status,source,price,notes,confirmation_status,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,'scheduled','client_portal',?,?, 'pending', UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
          [id, access.account_id, access.contact_id, String(args.p_service_id), String(args.p_professional_profile_id), start, end, service.price, args.p_notes == null ? null : String(args.p_notes)]
        );
        const benefitCode = String(args.p_benefit_code ?? '').trim();
        const benefitPin = String(args.p_benefit_pin ?? '').trim();
        if (!benefitCode) return;
        if (!/^\d{4,8}$/.test(benefitPin)) {
          throw new Error('A valid benefit PIN is required.');
        }

        const [vouchers] = await connection.execute<
          (RowDataPacket & {
            id: string;
            voucher_type: string;
            service_id: string | null;
            remaining_uses: number | null;
            current_balance: number;
          })[]
        >(
          `SELECT id,voucher_type,service_id,remaining_uses,current_balance
           FROM finance_vouchers
           WHERE account_id=? AND owner_contact_id=? AND UPPER(code)=UPPER(?)
             AND pin_code=? AND status='active'
             AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())
           LIMIT 1 FOR UPDATE`,
          [access.account_id, access.contact_id, benefitCode, benefitPin]
        );
        const voucher = vouchers[0];
        if (voucher) {
          if (
            voucher.voucher_type === 'service' &&
            (voucher.service_id !== String(args.p_service_id) ||
              Number(voucher.remaining_uses) < 1)
          ) {
            throw new Error('This voucher is not valid for the selected service.');
          }
          const [reserved] = await connection.execute<
            (RowDataPacket & { amount: number })[]
          >(
            "SELECT COALESCE(SUM(reserved_amount),0) amount FROM finance_appointment_benefits WHERE voucher_id=? AND status='reserved'",
            [voucher.id]
          );
          const reservedAmount =
            voucher.voucher_type === 'service'
              ? Number(service.price)
              : Math.min(
                  Number(service.price),
                  Number(voucher.current_balance) - Number(reserved[0].amount)
                );
          if (reservedAmount <= 0) {
            throw new Error('This voucher has no available balance.');
          }
          await connection.execute(
            `INSERT INTO finance_appointment_benefits(
              id,account_id,appointment_id,contact_id,benefit_type,voucher_id,
              service_id,reserved_amount
            ) VALUES(?,?,?,?, 'voucher',?,?,?)`,
            [
              randomUUID(),
              access.account_id,
              id,
              access.contact_id,
              voucher.id,
              String(args.p_service_id),
              reservedAmount,
            ]
          );
          return;
        }

        const [balances] = await connection.execute<
          (RowDataPacket & { pack_id: string; balance_id: string; remaining_sessions: number })[]
        >(
          `SELECT p.id pack_id,b.id balance_id,b.remaining_sessions
           FROM finance_client_packs p
           JOIN finance_client_pack_balances b ON b.client_pack_id=p.id
           WHERE p.account_id=? AND p.contact_id=? AND UPPER(p.code)=UPPER(?)
             AND p.pin_code=? AND p.status='active'
             AND (p.expires_at IS NULL OR p.expires_at>UTC_TIMESTAMP())
             AND b.service_id=?
           LIMIT 1 FOR UPDATE`,
          [
            access.account_id,
            access.contact_id,
            benefitCode,
            benefitPin,
            String(args.p_service_id),
          ]
        );
        const balance = balances[0];
        if (!balance) {
          throw new Error('The voucher or pack is not available for this booking.');
        }
        const [reservedSessions] = await connection.execute<
          (RowDataPacket & { sessions: number })[]
        >(
          "SELECT COALESCE(SUM(reserved_sessions),0) sessions FROM finance_appointment_benefits WHERE client_pack_balance_id=? AND status='reserved'",
          [balance.balance_id]
        );
        if (
          Number(balance.remaining_sessions) -
            Number(reservedSessions[0].sessions) <
          1
        ) {
          throw new Error('This pack has no available sessions.');
        }
        await connection.execute(
          `INSERT INTO finance_appointment_benefits(
            id,account_id,appointment_id,contact_id,benefit_type,client_pack_id,
            client_pack_balance_id,service_id,reserved_sessions
          ) VALUES(?,?,?,?, 'pack',?,?,?,1)`,
          [
            randomUUID(),
            access.account_id,
            id,
            access.contact_id,
            balance.pack_id,
            balance.balance_id,
            String(args.p_service_id),
          ]
        );
      });
      return { data: id, error: null };
    }
    return { data: null, error: { message: `Unsupported portal operation: ${name}` } };
  } catch (cause) { return { data: null, error: { message: cause instanceof Error ? cause.message : 'Portal operation failed.' } }; }
}

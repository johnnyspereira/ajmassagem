import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';

type PortalUser = { id: string; email: string } | null;

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
      const rows = await selectRows<(RowDataPacket & { account_id: string; contact_id: string })[]>(
        `SELECT p.account_id,p.contact_id FROM client_portal_access p JOIN client_portal_settings s ON s.account_id=p.account_id
          WHERE p.auth_user_id=? AND LOWER(s.slug)=LOWER(?) AND s.enabled=TRUE AND s.booking_enabled=TRUE LIMIT 1`,
        [user.id, String(args.p_slug)]
      );
      const access = rows[0]; if (!access) throw new Error('Portal booking is unavailable.');
      const id = randomUUID();
      await transaction(async (connection) => {
        const [services] = await connection.execute<(RowDataPacket & { duration_minutes: number; price: number })[]>(
          'SELECT duration_minutes,price FROM clinic_services WHERE id=? AND account_id=? AND is_active=TRUE LIMIT 1',
          [String(args.p_service_id), access.account_id]
        );
        const service = services[0]; if (!service) throw new Error('Service unavailable.');
        const start = new Date(String(args.p_scheduled_start)); if (Number.isNaN(start.getTime())) throw new Error('Invalid appointment time.');
        const end = new Date(start.getTime() + service.duration_minutes * 60_000);
        const [conflicts] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM clinic_appointments WHERE account_id=? AND professional_profile_id=? AND status IN ('scheduled','confirmed','in_progress')
            AND scheduled_start < ? AND scheduled_end > ? LIMIT 1`,
          [access.account_id, String(args.p_professional_profile_id), end, start]
        );
        if (conflicts.length) throw new Error('The selected time is no longer available.');
        await connection.execute(
          `INSERT INTO clinic_appointments(id,account_id,contact_id,service_id,professional_profile_id,scheduled_start,scheduled_end,status,price,notes,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,'scheduled',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
          [id, access.account_id, access.contact_id, String(args.p_service_id), String(args.p_professional_profile_id), start, end, service.price, args.p_notes == null ? null : String(args.p_notes)]
        );
      });
      return { data: id, error: null };
    }
    return { data: null, error: { message: `Unsupported portal operation: ${name}` } };
  } catch (cause) { return { data: null, error: { message: cause instanceof Error ? cause.message : 'Portal operation failed.' } }; }
}

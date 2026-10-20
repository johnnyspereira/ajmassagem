import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';
export async function GET() {
  try {
    const { accountId } = await requireRole('agent');
    const appointments = await selectRows<RowDataPacket[]>(
      `SELECT a.id,a.scheduled_start,a.status,a.last_schedule_change_type,a.confirmation_status,a.confirmation_response_at,a.reminder_sent_at,a.confirmation_reminder_sent_at,c.name,c.phone,s.name AS service_name
      FROM clinic_appointments a LEFT JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id LEFT JOIN clinic_services s ON s.id=a.service_id
      WHERE a.account_id=? AND a.status IN ('scheduled','confirmed') AND a.scheduled_start>UTC_TIMESTAMP() AND a.scheduled_start<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)
      ORDER BY a.scheduled_start LIMIT 500`,
      [accountId]
    );
    const events = await selectRows<RowDataPacket[]>(
      `SELECT e.id,e.entity_id,e.created_at,e.action,e.reason,e.metadata FROM clinic_agenda_events e WHERE e.account_id=? AND e.entity_type='appointment' AND e.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND e.action IN ('message_sent','status_changed') ORDER BY e.created_at DESC LIMIT 1000`,
      [accountId]
    );
    return Response.json(
      { appointments, events },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

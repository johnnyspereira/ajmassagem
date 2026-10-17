import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import {
  sendAppointmentCommunication,
  sendAppointmentStatusCommunication,
} from '@/lib/clinic/appointment-communication';

class ActionError extends Error {
  constructor(
    message: string,
    public status = 409
  ) {
    super(message);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !['confirm', 'cancel', 'reschedule'].includes(body.action)) {
      return Response.json(
        { error: 'Escolha uma ação válida.' },
        { status: 400 }
      );
    }
    const reason =
      typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
    const action = body.action as 'confirm' | 'cancel' | 'reschedule';
    const result = await transaction(async (connection) => {
      // Serializes dashboard changes for a tenant before checking availability.
      await connection.execute(
        'SELECT id FROM accounts WHERE id=? FOR UPDATE',
        [accountId]
      );
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT * FROM clinic_appointments WHERE id=? AND account_id=? FOR UPDATE',
        [id, accountId]
      );
      const appointment = rows[0];
      if (!appointment) throw new ActionError('Marcação não encontrada.', 404);
      if (!['scheduled', 'confirmed'].includes(appointment.status)) {
        throw new ActionError(
          'Esta marcação já foi concluída ou cancelada. Atualize o painel.'
        );
      }
      if (
        body.expectedStart !==
          new Date(appointment.scheduled_start).toISOString() ||
        (body.expectedStatus && body.expectedStatus !== appointment.status)
      ) {
        throw new ActionError(
          'A marcação foi alterada na agenda. Atualize antes de continuar.'
        );
      }
      const start = new Date(appointment.scheduled_start);
      const end = new Date(appointment.scheduled_end);
      let newStart = start;
      let newEnd = end;
      const nextStatus =
        action === 'cancel'
          ? 'cancelled'
          : action === 'confirm'
            ? 'confirmed'
            : appointment.status;
      if (action === 'cancel') {
        if (reason.length < 3)
          throw new ActionError('Indique o motivo do cancelamento.', 400);
        const [payments] = await connection.execute<RowDataPacket[]>(
          "SELECT p.id FROM finance_payments p JOIN finance_sales s ON s.id=p.sale_id WHERE s.appointment_id=? AND p.account_id=? AND p.status='confirmed' LIMIT 1",
          [id, accountId]
        );
        if (appointment.paid_at || payments.length) {
          throw new ActionError(
            'Esta marcação tem pagamentos. Abra a agenda para tratar o cancelamento e eventual reembolso.'
          );
        }
        // Reserved vouchers/packs are returned atomically with the cancellation.
        await connection.execute(
          "UPDATE finance_appointment_benefits SET status='released',released_at=UTC_TIMESTAMP(3) WHERE appointment_id=? AND account_id=? AND status='reserved'",
          [id, accountId]
        );
        await connection.execute(
          "UPDATE clinic_appointments SET status='cancelled',cancelled_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?",
          [id, accountId]
        );
      } else if (action === 'confirm') {
        if (appointment.status === 'confirmed')
          return { status: nextStatus, changed: false };
        await connection.execute(
          "UPDATE clinic_appointments SET status='confirmed',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?",
          [id, accountId]
        );
      } else {
        newStart = new Date(
          typeof body.startsAt === 'string' ? body.startsAt : ''
        );
        newEnd = new Date(newStart.getTime() + end.getTime() - start.getTime());
        if (
          !Number.isFinite(newStart.getTime()) ||
          newStart <= new Date() ||
          newEnd <= newStart
        ) {
          throw new ActionError(
            'Escolha uma data e hora futuras válidas.',
            400
          );
        }
        if (newStart.getTime() === start.getTime())
          throw new ActionError('Escolha um horário diferente.', 400);
        const [conflicts] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM clinic_appointments WHERE account_id=? AND id<>? AND status NOT IN ('cancelled','no_show')
           AND scheduled_start<? AND scheduled_end>? AND
           ((professional_profile_id IS NOT NULL AND professional_profile_id=?) OR (room_id IS NOT NULL AND room_id=?)) LIMIT 1 FOR UPDATE`,
          [
            accountId,
            id,
            newEnd,
            newStart,
            appointment.professional_profile_id,
            appointment.room_id,
          ]
        );
        const [blocks] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM clinic_time_blocks WHERE account_id=? AND starts_at<? AND ends_at>?
           AND ((professional_profile_id IS NULL AND room_id IS NULL) OR professional_profile_id=? OR room_id=?) LIMIT 1 FOR UPDATE`,
          [
            accountId,
            newEnd,
            newStart,
            appointment.professional_profile_id,
            appointment.room_id,
          ]
        );
        if (conflicts.length || blocks.length)
          throw new ActionError(
            'Este horário coincide com outra marcação ou bloqueio. Escolha outro horário.'
          );
        await connection.execute(
          `UPDATE clinic_appointments SET
          original_scheduled_start=COALESCE(original_scheduled_start,scheduled_start),original_scheduled_end=COALESCE(original_scheduled_end,scheduled_end),
          scheduled_start=?,scheduled_end=?,schedule_change_count=COALESCE(schedule_change_count,0)+1,reschedule_count=COALESCE(reschedule_count,0)+1,
          last_schedule_change_at=UTC_TIMESTAMP(3),last_schedule_change_type='rescheduled',last_reschedule_reason=?,
          confirmation_status='not_required',confirmation_requested_at=NULL,confirmation_response_at=NULL,confirmation_request_message=NULL,
          updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?`,
          [newStart, newEnd, reason || 'Reagendado no dashboard', id, accountId]
        );
      }
      await connection.execute(
        `INSERT INTO clinic_agenda_events
        (id,account_id,user_id,entity_type,entity_id,action,reason,metadata,old_starts_at,old_ends_at,new_starts_at,new_ends_at)
        VALUES (?,?,?,'appointment',?,?,?,?,?,?,?,?)`,
        [
          randomUUID(),
          accountId,
          userId,
          id,
          action === 'reschedule' ? 'rescheduled' : 'status_changed',
          reason || null,
          JSON.stringify({
            source: 'dashboard',
            previous_status: appointment.status,
            new_status: nextStatus,
            portal_reschedule_approved: action === 'reschedule',
          }),
          start,
          end,
          newStart,
          newEnd,
        ]
      );
      return { status: nextStatus, changed: true };
    });
    let warning: string | null = null;
    if (result.changed) {
      try {
        const notification =
          action === 'reschedule'
            ? await sendAppointmentCommunication({
                db: supabase,
                appointmentId: id,
                origin: request.url,
                action: 'confirmation',
                retry: true,
                confirmationApproved: result.status === 'confirmed',
              })
            : await sendAppointmentStatusCommunication({
                db: supabase,
                appointmentId: id,
                status: result.status,
              });
        if (
          notification.deliveries &&
          !notification.deliveries.whatsapp.sent &&
          !notification.deliveries.email.sent
        ) {
          warning =
            'Alteração guardada, mas a notificação ao cliente não foi enviada. Consulte a agenda.';
        }
      } catch {
        warning =
          'Alteração guardada. Não foi possível enviar a notificação ao cliente; consulte a agenda.';
      }
    }
    return Response.json({ success: true, warning });
  } catch (error) {
    if (error instanceof ActionError)
      return Response.json({ error: error.message }, { status: error.status });
    return toErrorResponse(error);
  }
}

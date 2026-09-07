import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import {
  sendAppointmentCommunication,
  sendAppointmentStatusCommunication,
} from '@/lib/clinic/appointment-communication';
import { notifyAccountEvent } from '@/lib/notifications/account-events';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { sessionClient, admin, access } = await requirePortalAccess(slug);
    const body = (await request.json()) as Record<string, unknown>;
    const { data, error } = await sessionClient.rpc(
      'portal_create_appointment',
      {
        p_slug: slug,
        p_service_id: body.serviceId,
        p_professional_profile_id: body.professionalId,
        p_scheduled_start: body.scheduledStart,
        p_benefit_code: body.benefitCode || null,
        p_benefit_pin: body.benefitPin || null,
        p_notes: body.notes || null,
      }
    );
    if (error) return Response.json({ error: error.message }, { status: 400 });
    let alertWarning: string | null = null;
    try {
      const { data: appointment } = await admin
        .from('clinic_appointments')
        .select('id,scheduled_start,contact:contacts(name,phone),service:clinic_services(name),professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name)')
        .eq('id', String(data))
        .eq('account_id', access.account_id)
        .maybeSingle();
      if (appointment) {
        const contact = Array.isArray(appointment.contact) ? appointment.contact[0] : appointment.contact;
        const appointmentService = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
        const professionalRow = Array.isArray(appointment.professional) ? appointment.professional[0] : appointment.professional;
        const client = contact?.name || contact?.phone || 'Cliente';
        const service = appointmentService?.name || 'Serviço';
        const professional = professionalRow?.full_name || 'Profissional';
        const when = new Intl.DateTimeFormat('pt-PT', {
          dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Lisbon',
        }).format(new Date(appointment.scheduled_start));
        await notifyAccountEvent({
          accountId: access.account_id,
          type: 'portal_appointment_created',
          category: 'clinic',
          priority: 'high',
          title: 'Nova marcação pelo Portal 360',
          body: `${client} marcou ${service} para ${when} com ${professional}.`,
          actionUrl: `/agenda?appointment=${appointment.id}`,
          contactId: access.contact_id,
          dedupeKey: `portal-appointment:${appointment.id}`,
          whatsappText: `📅 *Nova marcação pelo Portal 360*\n\nCliente: *${client}*\nServiço: *${service}*\nData: *${when}*\nProfissional: *${professional}*\n\nAbra a Agenda para gerir a marcação.`,
        });
      }
    } catch (alertError) {
      alertWarning = alertError instanceof Error ? alertError.message : 'Falha no alerta ao responsável.';
      console.error('[portal-appointment-alert]', alertError);
    }
    let messageWarning: string | null = null;
    let messageSkipped = false;
    try {
      const communication = await sendAppointmentCommunication({
        db: admin,
        appointmentId: String(data),
        origin: new URL(request.url).origin,
      });
      messageSkipped = communication.skipped;
    } catch (messageError) {
      messageWarning =
        messageError instanceof Error
          ? messageError.message
          : 'Falha no envio.';
    }
    return Response.json(
      { appointmentId: data, messageWarning, messageSkipped, alertWarning },
      { status: 201 }
    );
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { sessionClient, admin } = await requirePortalAccess(slug);
    const body = (await request.json()) as { appointmentId?: string };
    if (!body.appointmentId)
      return Response.json(
        { error: 'Appointment is required' },
        { status: 400 }
      );
    const { error } = await sessionClient.rpc('portal_cancel_appointment', {
      p_slug: slug,
      p_appointment_id: body.appointmentId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    let notificationWarning: string | null = null;
    try {
      await sendAppointmentStatusCommunication({
        db: admin,
        appointmentId: body.appointmentId,
        status: 'cancelled',
      });
    } catch (notificationError) {
      notificationWarning =
        notificationError instanceof Error
          ? notificationError.message
          : 'Falha na notificação.';
    }
    return Response.json({ ok: true, notificationWarning });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

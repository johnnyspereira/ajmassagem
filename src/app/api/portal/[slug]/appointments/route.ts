import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { sendAppointmentCommunication } from '@/lib/clinic/appointment-communication';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { sessionClient, admin } = await requirePortalAccess(slug);
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
    let messageWarning: string | null = null;
    let messageSkipped = false;
    try {
      const communication = await sendAppointmentCommunication({
        db: admin,
        appointmentId: data,
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
      { appointmentId: data, messageWarning, messageSkipped },
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
    const { sessionClient } = await requirePortalAccess(slug);
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
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

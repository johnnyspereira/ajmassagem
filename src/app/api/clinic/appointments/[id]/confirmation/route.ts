import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendAppointmentCommunication } from '@/lib/clinic/appointment-communication';
import { createClient } from '@/lib/supabase/server';
import { reminderStart } from '@/lib/clinic/reminder-schedule';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role)) {
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    approvedClientRequest?: unknown;
    retry?: unknown;
    action?: unknown;
  };
  const messageOverride =
    typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  const { data: appointment } = await db
    .from('clinic_appointments')
    .select('id,status,scheduled_start')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle();
  if (!appointment)
    return Response.json(
      { error: 'Marcação não encontrada.' },
      { status: 404 }
    );
  const isReminder = body.action === 'reminder';
  if (
    isReminder &&
    (!['scheduled', 'confirmed'].includes(appointment.status) ||
      !(reminderStart(appointment.scheduled_start) > Date.now()))
  ) {
    return Response.json(
      { error: 'Só é possível enviar lembretes de sessões futuras e ativas.' },
      { status: 409 }
    );
  }
  try {
    const result = await sendAppointmentCommunication({
      db,
      appointmentId: id,
      origin: new URL(request.url).origin,
      messageOverride: messageOverride || null,
      confirmationApproved: body.approvedClientRequest === true,
      retry: body.retry === true,
      ...(isReminder ? { action: 'reminder' as const } : {}),
    });
    return Response.json({
      ok: true,
      skipped: result.skipped,
      anamnesisUrl: result.anamnesisUrl,
      deliveries: 'deliveries' in result ? result.deliveries : undefined,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha no envio.' },
      { status: 502 }
    );
  }
}

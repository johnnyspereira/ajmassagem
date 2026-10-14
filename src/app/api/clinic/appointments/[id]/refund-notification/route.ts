import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendAppointmentRefundCommunication } from '@/lib/clinic/appointment-communication';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    amount?: unknown;
    paymentMethods?: unknown;
  };
  const amount = Number(body.amount);
  const paymentMethods = Array.isArray(body.paymentMethods)
    ? body.paymentMethods
        .filter((method): method is string => typeof method === 'string')
        .map((method) => method.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (!(amount > 0))
    return Response.json({ error: 'Valor de reembolso inválido.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });

  const { id } = await params;
  const { data: appointment } = await db
    .from('clinic_appointments')
    .select('id,status')
    .eq('id', id)
    .eq('account_id', profile.account_id)
    .maybeSingle();
  if (!appointment)
    return Response.json({ error: 'Marcação não encontrada.' }, { status: 404 });
  if (appointment.status !== 'cancelled')
    return Response.json(
      { error: 'Cancele primeiro a marcação antes de enviar o reembolso.' },
      { status: 409 }
    );

  try {
    return Response.json(
      await sendAppointmentRefundCommunication({
        db,
        appointmentId: id,
        amount,
        paymentMethods,
      })
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Falha ao enviar a comunicação.' },
      { status: 502 }
    );
  }
}

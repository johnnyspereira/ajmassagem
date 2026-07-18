import type { SupabaseClient } from '@supabase/supabase-js';

import { engineSendText } from '@/lib/automations/meta-send';
import {
  buildAppointmentMessage,
  canMessageAppointment,
  type AppointmentMessageAction,
  type AppointmentMessageRow,
} from '@/lib/clinic/appointment-messages';

type SendAppointmentCommunicationInput = {
  db: SupabaseClient;
  appointmentId: string;
  origin: string;
  action?: AppointmentMessageAction;
};

export async function sendAppointmentCommunication({
  db,
  appointmentId,
  origin,
  action = 'confirmation',
}: SendAppointmentCommunicationInput) {
  const { data: appointment, error } = await db
    .from('clinic_appointments')
    .select(
      '*, contact:contacts(id,name,phone,email,birth_date), service:clinic_services(id,name,category), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name,email), account:accounts(name,owner_user_id)'
    )
    .eq('id', appointmentId)
    .single();
  if (error || !appointment)
    throw new Error(error?.message || 'Marcação não encontrada.');
  if (!canMessageAppointment(appointment as AppointmentMessageRow)) {
    throw new Error('O cliente não possui um telefone válido para WhatsApp.');
  }

  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('*')
    .eq('account_id', appointment.account_id)
    .maybeSingle();

  if (action === 'confirmation' && settings?.auto_send_confirmation === false) {
    return { text: null, anamnesisUrl: null, skipped: true };
  }

  let anamnesisUrl: string | null = null;
  if (action === 'confirmation') {
    const { data: existingForm } = await db
      .from('clinic_anamnesis_forms')
      .select('id,public_token')
      .eq('appointment_id', appointment.id)
      .maybeSingle();
    let form = existingForm;
    if (!form) {
      const { data: createdForm, error: formError } = await db
        .from('clinic_anamnesis_forms')
        .insert({
          account_id: appointment.account_id,
          contact_id: appointment.contact_id,
          appointment_id: appointment.id,
          service_id: appointment.service_id,
          client_name: appointment.contact?.name || null,
          client_email: appointment.contact?.email || null,
          client_phone: appointment.contact?.phone || null,
          birth_date: appointment.contact?.birth_date || null,
          selected_modalities: [
            appointment.service?.name,
            appointment.service?.category,
          ].filter((value): value is string => Boolean(value)),
        })
        .select('id,public_token')
        .single();
      if (formError)
        throw new Error(`Falha ao criar anamnese: ${formError.message}`);
      form = createdForm;
      await db
        .from('clinic_appointments')
        .update({ anamnesis_form_id: form.id })
        .eq('id', appointment.id);
    }
    anamnesisUrl = `${origin.replace(/\/$/, '')}/anamnese/${form.public_token}`;
  }

  const contactId = appointment.contact_id as string;
  const userId = (appointment.user_id || appointment.account?.owner_user_id) as
    string | null;
  if (!userId)
    throw new Error('Não foi possível identificar o remetente da clínica.');
  const conversationId = await findOrCreateConversation(
    db,
    appointment.account_id,
    contactId,
    userId
  );
  const text = buildAppointmentMessage(
    appointment as AppointmentMessageRow,
    action,
    appointment.account?.name || '',
    {
      clinicAddress: settings?.clinic_address,
      directions: settings?.directions,
      parkingInfo: settings?.parking_info,
      paymentMethods: settings?.payment_methods,
      anamnesisUrl,
      anamnesisIntro: settings?.anamnesis_intro,
    }
  );

  await engineSendText({
    accountId: appointment.account_id,
    userId,
    conversationId,
    contactId,
    text,
  });

  const now = new Date().toISOString();
  const update =
    action === 'pending_confirmation'
      ? { confirmation_reminder_sent_at: now }
      : action === 'reminder'
        ? { reminder_sent_at: now }
        : {
            confirmation_status: 'pending',
            confirmation_requested_at: now,
            confirmation_response_at: null,
            confirmation_sent_at: now,
            confirmation_request_message: text,
          };
  await db.from('clinic_appointments').update(update).eq('id', appointment.id);
  await db.from('clinic_agenda_events').insert({
    account_id: appointment.account_id,
    entity_type: 'appointment',
    entity_id: appointment.id,
    action: 'message_sent',
    reason:
      action === 'pending_confirmation'
        ? 'Lembrete automático de confirmação pendente'
        : action === 'reminder'
          ? 'Lembrete automático da marcação'
          : 'Confirmação automática da marcação enviada',
    metadata: { message_action: action, contact_id: contactId },
  });
  return { text, anamnesisUrl, skipped: false };
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  userId: string
) {
  const { data: existing } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id as string;
  const { data: created, error } = await db
    .from('conversations')
    .insert({ account_id: accountId, user_id: userId, contact_id: contactId })
    .select('id')
    .single();
  if (error || !created)
    throw new Error(error?.message || 'Falha ao criar conversa.');
  return created.id as string;
}

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { engineSendText } from '@/lib/automations/meta-send';
import {
  appointmentConfirmationEmail,
  appointmentStatusEmail,
  appointmentStatusMessage,
  type AppointmentStatus,
} from '@/lib/clinic/appointment-email';
import {
  buildAppointmentMessage,
  canMessageAppointment,
  type AppointmentMessageAction,
  type AppointmentMessageRow,
} from '@/lib/clinic/appointment-messages';
import { sendLocalEmail } from '@/lib/email/smtp';

type Delivery = { sent: boolean; skipped: boolean; error: string | null };
export type AppointmentDeliveries = { whatsapp: Delivery; email: Delivery };

export async function sendAppointmentCommunication({
  db,
  appointmentId,
  origin,
  action = 'confirmation',
}: {
  db: SupabaseClient;
  appointmentId: string;
  origin: string;
  action?: AppointmentMessageAction;
}) {
  const { data: appointment, error } = await loadAppointment(db, appointmentId);
  if (error || !appointment)
    throw new Error(error?.message || 'Marcação não encontrada.');
  const row = appointment as AppointmentMessageRow;
  const email = appointment.contact?.email?.trim() || null;
  if (!canMessageAppointment(row) && !email)
    throw new Error(
      'O cliente não possui telefone nem email para receber a confirmação.'
    );
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('*')
    .eq('account_id', appointment.account_id)
    .maybeSingle();
  if (action === 'confirmation' && settings?.auto_send_confirmation === false)
    return { text: null, anamnesisUrl: null, skipped: true };

  let anamnesisUrl: string | null = null;
  if (action === 'confirmation') {
    const { data: existing } = await db
      .from('clinic_anamnesis_forms')
      .select('id,public_token')
      .eq('appointment_id', appointment.id)
      .maybeSingle();
    let form = existing;
    if (!form) {
      const { data: created, error: formError } = await db
        .from('clinic_anamnesis_forms')
        .insert({
          account_id: appointment.account_id,
          contact_id: appointment.contact_id,
          appointment_id: appointment.id,
          service_id: appointment.service_id,
          public_token: randomUUID(),
          client_name: appointment.contact?.name || null,
          client_email: email,
          client_phone: appointment.contact?.phone || null,
          birth_date: appointment.contact?.birth_date || null,
          selected_modalities: [
            appointment.service?.name,
            appointment.service?.category,
          ].filter((value): value is string => Boolean(value)),
          answers: {},
          expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        })
        .select('id,public_token')
        .single();
      if (formError)
        throw new Error(`Falha ao criar anamnese: ${formError.message}`);
      form = created;
      await db
        .from('clinic_appointments')
        .update({ anamnesis_form_id: form.id })
        .eq('id', appointment.id);
    }
    anamnesisUrl = `${origin.replace(/\/$/, '')}/anamnese/${form.public_token}`;
  }

  const sender = appointment.user_id || appointment.account?.owner_user_id;
  if (!sender)
    throw new Error('Não foi possível identificar o remetente da clínica.');
  const businessName = appointment.account?.name || '';
  const text = buildAppointmentMessage(row, action, businessName, {
    clinicAddress: settings?.clinic_address,
    directions: settings?.directions,
    parkingInfo: settings?.parking_info,
    paymentMethods: settings?.payment_methods,
    anamnesisUrl,
    anamnesisIntro: settings?.anamnesis_intro,
  });
  const deliveries = await deliverChannels({
    db,
    appointment: row,
    accountId: appointment.account_id,
    contactId: appointment.contact_id,
    userId: sender,
    whatsappText: text,
    email,
    emailContent: appointmentConfirmationEmail({
      appointment: row,
      businessName,
      anamnesisUrl,
    }),
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
  if (deliveries.whatsapp.sent || deliveries.email.sent)
    await db
      .from('clinic_appointments')
      .update(update)
      .eq('id', appointment.id);
  await logDelivery(db, appointment, action, deliveries);
  return { text, anamnesisUrl, skipped: false, deliveries };
}

export async function sendAppointmentStatusCommunication(input: {
  db: SupabaseClient;
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const { data: appointment, error } = await loadAppointment(
    input.db,
    input.appointmentId
  );
  if (error || !appointment)
    throw new Error(error?.message || 'Marcação não encontrada.');
  const sender = appointment.user_id || appointment.account?.owner_user_id;
  if (!sender)
    throw new Error('Não foi possível identificar o remetente da clínica.');
  const row = appointment as AppointmentMessageRow;
  const businessName = appointment.account?.name || '';
  const deliveries = await deliverChannels({
    db: input.db,
    appointment: row,
    accountId: appointment.account_id,
    contactId: appointment.contact_id,
    userId: sender,
    whatsappText: appointmentStatusMessage({
      appointment: row,
      businessName,
      status: input.status,
    }),
    email: appointment.contact?.email?.trim() || null,
    emailContent: appointmentStatusEmail({
      appointment: row,
      businessName,
      status: input.status,
    }),
  });
  await logDelivery(
    input.db,
    appointment,
    'status_changed',
    deliveries,
    input.status
  );
  return { deliveries };
}

function loadAppointment(db: SupabaseClient, appointmentId: string) {
  return db
    .from('clinic_appointments')
    .select(
      '*, contact:contacts(id,name,phone,email,birth_date), service:clinic_services(id,name,category), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name,email), account:accounts(name,owner_user_id)'
    )
    .eq('id', appointmentId)
    .single();
}

async function deliverChannels(input: {
  db: SupabaseClient;
  appointment: AppointmentMessageRow;
  accountId: string;
  contactId: string;
  userId: string;
  whatsappText: string;
  email: string | null;
  emailContent: { subject: string; text: string; html: string };
}) {
  const result: AppointmentDeliveries = {
    whatsapp: { sent: false, skipped: false, error: null },
    email: { sent: false, skipped: false, error: null },
  };
  if (canMessageAppointment(input.appointment)) {
    try {
      const conversationId = await findOrCreateConversation(
        input.db,
        input.accountId,
        input.contactId,
        input.userId
      );
      await engineSendText({
        accountId: input.accountId,
        userId: input.userId,
        conversationId,
        contactId: input.contactId,
        text: input.whatsappText,
      });
      result.whatsapp.sent = true;
    } catch (error) {
      result.whatsapp.error = errorMessage(error, 'Falha no WhatsApp.');
    }
  } else result.whatsapp.skipped = true;
  if (input.email) {
    try {
      await sendLocalEmail({ to: input.email, ...input.emailContent });
      result.email.sent = true;
    } catch (error) {
      result.email.error = errorMessage(error, 'Falha no email.');
    }
  } else result.email.skipped = true;
  return result;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function logDelivery(
  db: SupabaseClient,
  appointment: { account_id: string; id: string; contact_id: string },
  action: AppointmentMessageAction | 'status_changed',
  deliveries: AppointmentDeliveries,
  status?: AppointmentStatus
) {
  await db.from('clinic_agenda_events').insert({
    account_id: appointment.account_id,
    entity_type: 'appointment',
    entity_id: appointment.id,
    action: 'message_sent',
    reason:
      action === 'status_changed'
        ? `Notificação de estado enviada: ${status}`
        : 'Comunicação automática da marcação enviada',
    metadata: {
      message_action: action,
      status: status ?? null,
      contact_id: appointment.contact_id,
      deliveries,
    },
  });
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

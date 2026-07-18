import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildAppointmentMessage,
  canMessageAppointment,
  type AppointmentMessageRow,
} from '@/lib/clinic/appointment-messages';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/automations/meta-send';
import { sendAppointmentCommunication } from '@/lib/clinic/appointment-communication';

const DEFAULT_WINDOW_MINUTES = 120;
const MAX_WINDOW_MINUTES = 24 * 60;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type AppointmentReminderRow = AppointmentMessageRow & {
  account_id: string;
  user_id?: string | null;
  contact_id?: string | null;
  account?: {
    name?: string | null;
    owner_user_id?: string | null;
  } | null;
};

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }

  const supplied = request.headers.get('x-cron-secret');
  if (supplied !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const windowMinutes = clampNumber(
    Number(url.searchParams.get('window_minutes')),
    DEFAULT_WINDOW_MINUTES,
    1,
    MAX_WINDOW_MINUTES
  );
  const limit = clampNumber(
    Number(url.searchParams.get('limit')),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  );

  const now = new Date();
  const until = new Date(now.getTime() + windowMinutes * 60_000);
  const db = supabaseAdmin();
  const pendingBefore = new Date(now.getTime() - 60 * 60_000);

  const { data: pendingConfirmations, error: pendingError } = await db
    .from('clinic_appointments')
    .select('id,account_id,confirmation_requested_at')
    .eq('confirmation_status', 'pending')
    .is('confirmation_reminder_sent_at', null)
    .not('confirmation_requested_at', 'is', null)
    .lte('confirmation_requested_at', pendingBefore.toISOString())
    .gt('scheduled_start', now.toISOString())
    .limit(limit);
  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }
  const pendingAccountIds = [
    ...new Set((pendingConfirmations ?? []).map((item) => item.account_id)),
  ];
  const { data: communicationSettings } = pendingAccountIds.length
    ? await db
        .from('clinic_communication_settings')
        .select(
          'account_id,confirmation_reminder_hours,auto_send_pending_reminder'
        )
        .in('account_id', pendingAccountIds)
    : { data: [] };
  const settingsByAccount = new Map(
    (communicationSettings ?? []).map((item) => [item.account_id, item])
  );

  let confirmationRemindersSent = 0;
  const confirmationReminderFailures: Array<{
    appointment_id: string;
    error: string;
  }> = [];
  for (const pending of pendingConfirmations ?? []) {
    const reminderSettings = settingsByAccount.get(pending.account_id);
    if (reminderSettings?.auto_send_pending_reminder === false) continue;
    const reminderHours = Number(
      reminderSettings?.confirmation_reminder_hours ?? 24
    );
    const requestedAt = new Date(pending.confirmation_requested_at).getTime();
    if (requestedAt > now.getTime() - reminderHours * 60 * 60_000) continue;
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await db
      .from('clinic_appointments')
      .update({ confirmation_reminder_sent_at: claimedAt })
      .eq('id', pending.id)
      .is('confirmation_reminder_sent_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    try {
      await sendAppointmentCommunication({
        db,
        appointmentId: pending.id,
        origin: new URL(request.url).origin,
        action: 'pending_confirmation',
      });
      confirmationRemindersSent++;
    } catch (pendingSendError) {
      const message =
        pendingSendError instanceof Error
          ? pendingSendError.message
          : String(pendingSendError);
      confirmationReminderFailures.push({
        appointment_id: pending.id,
        error: message,
      });
      await db
        .from('clinic_appointments')
        .update({ confirmation_reminder_sent_at: null })
        .eq('id', pending.id)
        .eq('confirmation_reminder_sent_at', claimedAt);
    }
  }

  const { data, error } = await db
    .from('clinic_appointments')
    .select(
      [
        '*',
        'contact:contacts(id, name, phone)',
        'service:clinic_services(name)',
        'professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name, email)',
        'account:accounts(name, owner_user_id)',
      ].join(', ')
    )
    .in('status', ['scheduled', 'confirmed'])
    .is('reminder_sent_at', null)
    .gte('scheduled_start', now.toISOString())
    .lte('scheduled_start', until.toISOString())
    .order('scheduled_start', { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as unknown as AppointmentReminderRow[];
  let sent = 0;
  let skipped = 0;
  const failed: Array<{ appointment_id: string; error: string }> = [];

  for (const appointment of due) {
    const contactId = appointment.contact?.id ?? appointment.contact_id ?? null;
    const userId = appointment.user_id ?? appointment.account?.owner_user_id;

    if (!contactId || !userId || !canMessageAppointment(appointment)) {
      skipped++;
      continue;
    }

    const claimedAt = new Date().toISOString();
    const { data: claim, error: claimError } = await db
      .from('clinic_appointments')
      .update({ reminder_sent_at: claimedAt })
      .eq('id', appointment.id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle();

    if (claimError || !claim) {
      skipped++;
      continue;
    }

    try {
      const conversationId = await findOrCreateConversation(
        db,
        appointment.account_id,
        contactId,
        userId
      );
      const text = buildAppointmentMessage(
        appointment,
        'reminder',
        appointment.account?.name ?? ''
      );

      await engineSendText({
        accountId: appointment.account_id,
        userId,
        conversationId,
        contactId,
        text,
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ appointment_id: appointment.id, error: message });
      await db
        .from('clinic_appointments')
        .update({ reminder_sent_at: null })
        .eq('id', appointment.id)
        .eq('reminder_sent_at', claimedAt);
    }
  }

  return NextResponse.json({
    checked: due.length,
    sent,
    skipped,
    failed,
    pending_confirmations_checked: pendingConfirmations?.length ?? 0,
    confirmation_reminders_sent: confirmationRemindersSent,
    confirmation_reminder_failures: confirmationReminderFailures,
    window_minutes: windowMinutes,
  });
}

function clampNumber(
  value: number,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  userId: string
) {
  const { data: existing, error: findError } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError) {
    throw new Error(`conversation lookup failed: ${findError.message}`);
  }

  if (existing?.[0]?.id) return existing[0].id as string;

  const { data: created, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
    })
    .select('id')
    .single();

  if (!createError && created?.id) return created.id as string;

  const { data: raced } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (raced?.[0]?.id) return raced[0].id as string;

  throw new Error(
    `conversation create failed: ${createError?.message ?? 'unknown error'}`
  );
}

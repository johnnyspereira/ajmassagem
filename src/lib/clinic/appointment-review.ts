import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/automations/meta-send';
import { getPublicUrl } from '@/lib/public-url';

export async function sendAppointmentReviewRequest(db: SupabaseClient, appointmentId: string, origin: string) {
  const { data: appointment, error } = await db.from('clinic_appointments')
    .select('id,account_id,contact_id,user_id,contact:contacts(name,phone),service:clinic_services(name),account:accounts(name,owner_user_id)')
    .eq('id', appointmentId).maybeSingle();
  if (error || !appointment?.contact_id) throw new Error(error?.message || 'Marca\u00e7\u00e3o sem cliente.');
  const a = appointment as typeof appointment & { contact: { name?: string | null; phone?: string | null } | null; service: { name?: string | null } | null; account: { name?: string | null; owner_user_id?: string | null } | null };
  if (!a.contact?.phone) return { skipped: true };
  const { data: existing } = await db.from('clinic_appointment_reviews').select('public_token,sent_at').eq('appointment_id', appointmentId).maybeSingle();
  const token = existing?.public_token ?? randomUUID();
  if (!existing) await db.from('clinic_appointment_reviews').insert({ id: randomUUID(), account_id: a.account_id, appointment_id: a.id, contact_id: a.contact_id, public_token: token });
  if (existing?.sent_at) return { skipped: true };
  const userId = a.user_id || a.account?.owner_user_id;
  if (!userId) throw new Error('Sem remetente para enviar a avalia\u00e7\u00e3o.');
  const url = getPublicUrl(`/avaliar/${token}`, origin);
  await engineSendText({ accountId: a.account_id, userId, contactId: a.contact_id, conversationId: await findConversation(db, a.account_id, a.contact_id), text: `Obrigado por escolher ${a.account?.name || 'a nossa cl\u00ednica'}${a.service?.name ? ` para ${a.service.name}` : ''}. A sua opini\u00e3o ajuda-nos muito: ${url}` });
  await db.from('clinic_appointment_reviews').update({ sent_at: new Date().toISOString() }).eq('appointment_id', appointmentId);
  return { sent: true, url };
}

async function findConversation(db: SupabaseClient, accountId: string, contactId: string) {
  const { data } = await db.from('conversations').select('id').eq('account_id', accountId).eq('contact_id', contactId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data?.id) throw new Error('Conversa do cliente n\u00e3o encontrada.');
  return data.id;
}

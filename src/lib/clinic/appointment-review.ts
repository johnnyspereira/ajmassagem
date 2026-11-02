import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/automations/meta-send';
import { getPublicUrl } from '@/lib/public-url';
import { reviewRequestUrl } from './review-link';
import {
  mergeAutomatedMessageTemplates,
  renderAutomatedMessage,
  type AutomatedMessageTemplates,
} from '@/lib/automations/message-templates';

export async function sendAppointmentReviewRequest(
  db: SupabaseClient,
  appointmentId: string,
  origin: string
) {
  const { data: appointment, error } = await db
    .from('clinic_appointments')
    .select(
      'id,account_id,contact_id,user_id,contact:contacts(name,phone),service:clinic_services(name),account:accounts(name,owner_user_id)'
    )
    .eq('id', appointmentId)
    .maybeSingle();
  if (error || !appointment?.contact_id)
    throw new Error(error?.message || 'Marca\u00e7\u00e3o sem cliente.');
  const a = appointment as typeof appointment & {
    contact: { name?: string | null; phone?: string | null } | null;
    service: { name?: string | null } | null;
    account: { name?: string | null; owner_user_id?: string | null } | null;
  };
  if (!a.contact?.phone) return { skipped: true };
  const { data: settings, error: settingsError } = await db
    .from('clinic_communication_settings')
    .select('automated_message_templates,review_link_mode,review_google_url')
    .eq('account_id', a.account_id)
    .maybeSingle();
  if (settingsError)
    throw new Error(
      'Não foi possível carregar o destino da avaliação. Confirme a atualização da aplicação.'
    );
  const { data: existing, error: existingError } = await db
    .from('clinic_appointment_reviews')
    .select('public_token,sent_at')
    .eq('account_id', a.account_id)
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (existingError)
    throw new Error('Não foi possível consultar o pedido de avaliação.');
  const token = existing?.public_token ?? randomUUID();
  if (existing?.sent_at) return { skipped: true };
  const userId = a.user_id || a.account?.owner_user_id;
  if (!userId)
    throw new Error('Sem remetente para enviar a avalia\u00e7\u00e3o.');
  const { mode, url } = reviewRequestUrl(
    settings?.review_link_mode,
    settings?.review_google_url,
    getPublicUrl(`/avaliar/${token}`, origin)
  );
  const templates = mergeAutomatedMessageTemplates(
    settings?.automated_message_templates as
      Partial<AutomatedMessageTemplates> | null | undefined
  );
  if (!/\{link_avaliacao\}/i.test(templates.review_request))
    throw new Error(
      'O modelo Pedido de avaliação deve incluir {link_avaliacao}. Corrija-o nas mensagens automáticas.'
    );
  if (!existing) {
    const { error: insertError } = await db
      .from('clinic_appointment_reviews')
      .insert({
        id: randomUUID(),
        account_id: a.account_id,
        appointment_id: a.id,
        contact_id: a.contact_id,
        public_token: token,
      });
    if (insertError)
      throw new Error('Não foi possível registar o pedido de avaliação.');
  }
  const text = renderAutomatedMessage(templates.review_request, {
    cliente: a.contact?.name?.split(' ')[0] || 'cliente',
    empresa: a.account?.name || 'JP Massagem',
    servico: a.service?.name ? ` para ${a.service.name}` : '',
    link_avaliacao: url,
  });
  await engineSendText({
    accountId: a.account_id,
    userId,
    contactId: a.contact_id,
    conversationId: await findConversation(db, a.account_id, a.contact_id),
    text,
  });
  const { error: sentError } = await db
    .from('clinic_appointment_reviews')
    .update({
      sent_at: new Date().toISOString(),
      sent_link_mode: mode,
      sent_link_url: url,
    })
    .eq('account_id', a.account_id)
    .eq('appointment_id', appointmentId);
  if (sentError)
    throw new Error(
      'O pedido foi encaminhado, mas não foi possível atualizar o registo de avaliação. Verifique antes de repetir.'
    );
  return { sent: true, url, mode };
}

async function findConversation(
  db: SupabaseClient,
  accountId: string,
  contactId: string
) {
  const { data } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) throw new Error('Conversa do cliente n\u00e3o encontrada.');
  return data.id;
}

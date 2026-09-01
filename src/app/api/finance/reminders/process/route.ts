import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/automations/meta-send';
import { sendPush, type StoredPushSubscription } from '@/lib/push/server';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { getPublicUrl } from '@/lib/public-url';

type CreatedNotification = {
  id: string;
  account_id: string;
  user_id: string;
  title: string;
  body: string | null;
  action_url: string | null;
};
type Delivery = {
  id: string;
  account_id: string;
  recipient: string;
  attempts: number;
  notification: { title: string; body: string | null } | null;
};

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected)
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  if (request.headers.get('x-cron-secret') !== expected)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc(
    'process_finance_operational_reminders',
    { p_now: new Date().toISOString() }
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const created = (data ?? []) as CreatedNotification[];

  const accountIds = [...new Set(created.map((item) => item.account_id))];
  if (accountIds.length) {
    const { data: settings } = await admin
      .from('finance_reminder_settings')
      .select('account_id,whatsapp_enabled,whatsapp_phone')
      .in('account_id', accountIds)
      .eq('whatsapp_enabled', true);
    const byAccount = new Map(
      (settings ?? []).map((item) => [item.account_id, item])
    );
    const rows = created.flatMap((notification) => {
      const setting = byAccount.get(notification.account_id);
      return setting?.whatsapp_phone
        ? [
            {
              notification_id: notification.id,
              account_id: notification.account_id,
              channel: 'whatsapp',
              recipient: setting.whatsapp_phone,
            },
          ]
        : [];
    });
    if (rows.length)
      await admin.from('finance_reminder_deliveries').upsert(rows, {
        onConflict: 'notification_id',
        ignoreDuplicates: true,
      });
  }

  const userIds = [...new Set(created.map((item) => item.user_id))];
  if (userIds.length) {
    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('id,endpoint,p256dh,auth,user_id')
      .eq('owner_type', 'crm_user')
      .in('user_id', userIds);
    await Promise.all(
      created.map((notification) =>
        sendPush(
          (subscriptions ?? []).filter(
            (item) => item.user_id === notification.user_id
          ) as StoredPushSubscription[],
          {
            title: notification.title,
            body: notification.body,
            url: notification.action_url || '/finance',
            tag: notification.id,
          }
        )
      )
    );
  }

  const { data: due } = await admin
    .from('finance_reminder_deliveries')
    .select(
      'id,account_id,recipient,attempts,notification:notifications(title,body)'
    )
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempts', 5)
    .limit(25);
  let whatsappSent = 0;
  let whatsappFailed = 0;
  const financeUrl = getPublicUrl('/finance', new URL(request.url).origin);
  for (const delivery of (due ?? []) as unknown as Delivery[]) {
    const { data: claim } = await admin
      .from('finance_reminder_deliveries')
      .update({
        status: 'sending',
        attempts: delivery.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (!claim) continue;
    try {
      const { conversationId, contactId } = await resolveConversationByPhone(
        admin,
        delivery.account_id,
        delivery.recipient,
        'Alertas financeiros'
      );
      const { data: owner } = await admin
        .from('profiles')
        .select('user_id')
        .eq('account_id', delivery.account_id)
        .eq('account_role', 'owner')
        .limit(1)
        .single();
      if (!owner?.user_id)
        throw new Error('ProprietÃ¡rio da conta nÃ£o encontrado.');
      const message = `🔔 *${delivery.notification?.title ?? 'Alerta financeiro'}*\n\n${delivery.notification?.body ?? ''}\n\nAbra o CRM: ${financeUrl}`;
      const sent = await engineSendText({
        accountId: delivery.account_id,
        userId: owner.user_id,
        conversationId,
        contactId,
        text: message,
      });
      await admin
        .from('finance_reminder_deliveries')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: sent.whatsapp_message_id,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      whatsappSent++;
    } catch (error) {
      const delayMinutes = Math.min(60, 5 * 2 ** delivery.attempts);
      await admin
        .from('finance_reminder_deliveries')
        .update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : String(error),
          next_attempt_at: new Date(
            Date.now() + delayMinutes * 60000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      whatsappFailed++;
    }
  }
  return NextResponse.json({
    processed: created.length,
    pushed_to_users: userIds.length,
    whatsapp_sent: whatsappSent,
    whatsapp_failed: whatsappFailed,
  });
}

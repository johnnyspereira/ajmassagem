import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendPush, type StoredPushSubscription } from '@/lib/push/server';

type CreatedNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  action_url: string | null;
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
  return NextResponse.json({
    processed: created.length,
    pushed_to_users: userIds.length,
  });
}

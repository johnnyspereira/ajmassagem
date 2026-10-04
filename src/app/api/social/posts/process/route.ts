import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { publishScheduledInstagramPost } from '@/lib/social/publish-instagram';

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  const supplied = request.headers.get('x-cron-secret') || '';
  if (!expected) return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  if (expected.length !== supplied.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: due, error } = await admin
    .from('social_scheduled_posts')
    .select('id,account_id,post_type,caption,media_url')
    .eq('platform', 'instagram')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let published = 0;
  let failed = 0;
  for (const post of due ?? []) {
    const { data: claimed } = await admin.from('social_scheduled_posts')
      .update({ status: 'publishing', last_error: null }).eq('id', post.id).eq('status', 'scheduled').select('id').maybeSingle();
    if (!claimed) continue;
    try {
      await publishScheduledInstagramPost(admin, post as Parameters<typeof publishScheduledInstagramPost>[1]);
      published++;
    } catch (error) {
      failed++;
      await admin.from('social_scheduled_posts').update({ status: 'failed', last_error: error instanceof Error ? error.message : 'Falha ao publicar no Instagram.' }).eq('id', post.id);
    }
  }
  return NextResponse.json({ processed: (due ?? []).length, published, failed });
}

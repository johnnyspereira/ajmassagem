import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { publishScheduledInstagramPost } from '@/lib/social/publish-instagram';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as { postId?: string };
    if (!body.postId) return NextResponse.json({ error: 'postId Ã© obrigatÃ³rio.' }, { status: 400 });
    const { data: post, error } = await ctx.supabase
      .from('social_scheduled_posts')
      .select('id,account_id,post_type,caption,media_url,status')
      .eq('id', body.postId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (error) throw error;
    if (!post) return NextResponse.json({ error: 'PublicaÃ§Ã£o nÃ£o encontrada.' }, { status: 404 });
    if (!['instagram_feed', 'instagram_reel', 'instagram_story'].includes(post.post_type)) return NextResponse.json({ error: 'Esta publicaÃ§Ã£o nÃ£o Ã© do Instagram.' }, { status: 400 });
    const { data: claimed } = await ctx.supabase
      .from('social_scheduled_posts')
      .update({ status: 'publishing', last_error: null })
      .eq('id', post.id)
      .in('status', ['draft', 'scheduled', 'ready', 'failed'])
      .select('id')
      .maybeSingle();
    if (!claimed) return NextResponse.json({ error: 'A publicaÃ§Ã£o jÃ¡ estÃ¡ a ser processada.' }, { status: 409 });
    try {
      const providerPostId = await publishScheduledInstagramPost(ctx.supabase, post as Parameters<typeof publishScheduledInstagramPost>[1]);
      return NextResponse.json({ success: true, providerPostId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'NÃ£o foi possÃ­vel publicar no Instagram.';
      await ctx.supabase.from('social_scheduled_posts').update({ status: 'failed', last_error: message }).eq('id', post.id);
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

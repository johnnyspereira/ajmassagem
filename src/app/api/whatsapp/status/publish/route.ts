import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

type StatusPost = {
  id: string;
  title: string;
  caption: string;
  media_url: string | null;
  post_type: string;
};

function mediaType(url: string | null): 'text' | 'image' | 'video' | 'audio' {
  if (!url) return 'text';
  const pathname = url.split('?')[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|3gp)$/.test(pathname)) return 'video';
  if (/\.(mp3|m4a|ogg|aac|wav|opus)$/.test(pathname)) return 'audio';
  return 'image';
}

/** Publishes an approved WhatsApp Status through the locally paired QR worker. */
export async function POST(request: Request) {
  try {
    // Publishing to every contact that can see the account's Status is a
    // privileged operation, so only account admins can trigger it.
    const ctx = await requireRole('admin');
    if (!remoteWhatsAppWorker.enabled()) {
      return NextResponse.json(
        { error: 'O worker WhatsApp remoto não está configurado.' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { postId?: unknown };
    const postId = String(body.postId ?? '');
    if (!postId) {
      return NextResponse.json({ error: 'postId é obrigatório.' }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from('social_scheduled_posts')
      .select('id,title,caption,media_url,post_type')
      .eq('id', postId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const post = data as StatusPost | null;
    if (!post) return NextResponse.json({ error: 'Status não encontrado.' }, { status: 404 });
    if (post.post_type !== 'whatsapp_status_reminder') {
      return NextResponse.json({ error: 'Esta publicação não é um Status WhatsApp.' }, { status: 400 });
    }

    const worker = await remoteWhatsAppWorker.status({
      accountId: ctx.accountId,
      userId: ctx.userId,
      autoStart: true,
    });
    if (!worker.connected) {
      return NextResponse.json(
        { error: worker.lastError || 'Ligue a sessão QR do WhatsApp antes de publicar.' },
        { status: 409 }
      );
    }

    const result = await remoteWhatsAppWorker.publishStatus({
      accountId: ctx.accountId,
      userId: ctx.userId,
      text: post.caption,
      mediaUrl: post.media_url,
      filename: post.title,
      contentType: mediaType(post.media_url),
    });

    const { error: updateError } = await ctx.supabase
      .from('social_scheduled_posts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        provider_post_id: result.whatsappMessageId,
        last_error: null,
        provider_payload: {
          source: 'crm_social_planner',
          delivery_mode: 'local_worker',
          whatsapp_status_beta: true,
          published_via: 'whatsapp_web_qr',
        },
      })
      .eq('id', post.id)
      .eq('account_id', ctx.accountId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ success: true, whatsappMessageId: result.whatsappMessageId });
  } catch (error) {
    console.error('[whatsapp-status] publish failed:', error);
    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return toErrorResponse(error);
  }
}

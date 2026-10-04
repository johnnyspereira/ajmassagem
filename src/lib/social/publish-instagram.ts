import type { SupabaseClient } from '@supabase/supabase-js';

import { publishInstagramPost } from '@/lib/social/instagram';

type InstagramPost = {
  id: string;
  account_id: string;
  post_type: 'instagram_feed' | 'instagram_reel' | 'instagram_story';
  caption: string;
  media_url: string | null;
};

export async function publishScheduledInstagramPost(admin: SupabaseClient, post: InstagramPost) {
  const { data: connection, error: connectionError } = await admin
    .from('social_instagram_connections')
    .select('instagram_account_id,access_token_encrypted')
    .eq('account_id', post.account_id)
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error('Ligue uma conta Instagram profissional antes de publicar.');

  const providerPostId = await publishInstagramPost({
    connection: connection as { instagram_account_id: string; access_token_encrypted: string },
    type: post.post_type,
    caption: post.caption,
    mediaUrl: post.media_url,
  });
  const { error } = await admin
    .from('social_scheduled_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      provider_post_id: providerPostId,
      last_error: null,
      provider_payload: { source: 'instagram_graph_api', provider_post_id: providerPostId },
    })
    .eq('id', post.id)
    .eq('account_id', post.account_id);
  if (error) throw new Error(error.message);
  return providerPostId;
}

import { decrypt } from '@/lib/whatsapp/encryption';

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

type MetaError = { error?: { message?: string } };

async function metaJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as MetaError & T;
  if (!response.ok) throw new Error(body.error?.message || fallback);
  return body;
}

export type InstagramConnection = {
  instagram_account_id: string;
  access_token_encrypted: string;
};

export async function publishInstagramPost(input: {
  connection: InstagramConnection;
  type: 'instagram_feed' | 'instagram_reel' | 'instagram_story';
  caption: string;
  mediaUrl: string | null;
}) {
  if (!input.mediaUrl) throw new Error('O Instagram exige uma imagem ou vÃ­deo com URL pÃºblica.');
  const token = decrypt(input.connection.access_token_encrypted);
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(input.mediaUrl);
  const mediaType = input.type === 'instagram_story' ? 'STORIES' : input.type === 'instagram_reel' ? 'REELS' : undefined;
  const fields = new URLSearchParams();
  fields.set(isVideo ? 'video_url' : 'image_url', input.mediaUrl);
  if (input.caption && input.type !== 'instagram_story') fields.set('caption', input.caption);
  if (mediaType) fields.set('media_type', mediaType);
  fields.set('access_token', token);
  const container = await metaJson<{ id?: string }>(
    `${GRAPH}/${encodeURIComponent(input.connection.instagram_account_id)}/media`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: fields.toString() },
    'A Meta nÃ£o conseguiu criar a publicaÃ§Ã£o.'
  );
  if (!container.id) throw new Error('A Meta nÃ£o devolveu o identificador da publicaÃ§Ã£o.');
  if (isVideo) {
    let finished = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const status = await metaJson<{ status_code?: string; status?: string }>(
        `${GRAPH}/${encodeURIComponent(container.id)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
        {}, 'A Meta nÃ£o conseguiu validar o vÃ­deo.'
      );
      if (status.status_code === 'FINISHED') { finished = true; break; }
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(status.status || 'A Meta nÃ£o conseguiu processar o vÃ­deo.');
      }
    }
    if (!finished) throw new Error('O vÃ­deo ainda estÃ¡ a ser processado pela Meta. Tente novamente dentro de alguns minutos.');
  }
  const published = await metaJson<{ id?: string }>(
    `${GRAPH}/${encodeURIComponent(input.connection.instagram_account_id)}/media_publish`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString() },
    'A Meta nÃ£o conseguiu publicar o conteÃºdo.'
  );
  if (!published.id) throw new Error('A Meta nÃ£o confirmou a publicaÃ§Ã£o.');
  return published.id;
}

export async function exchangeInstagramCode(code: string, redirectUri: string) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Configure META_APP_ID e META_APP_SECRET para ligar o Instagram.');
  const token = await metaJson<{ access_token?: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`,
    {}, 'A Meta recusou a ligaÃ§Ã£o.'
  );
  if (!token.access_token) throw new Error('A Meta nÃ£o devolveu o token de acesso.');
  const pages = await metaJson<{ data?: Array<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }> }>(
    `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token.access_token)}`,
    {}, 'NÃ£o foi possÃ­vel obter as PÃ¡ginas Facebook.'
  );
  const page = pages.data?.find((item) => item.instagram_business_account?.id);
  if (!page?.instagram_business_account?.id) throw new Error('Nenhuma PÃ¡gina Facebook com conta Instagram profissional foi encontrada.');
  return { accessToken: token.access_token, expiresIn: token.expires_in ?? null, pageId: page.id, instagramId: page.instagram_business_account.id, username: page.instagram_business_account.username ?? null };
}

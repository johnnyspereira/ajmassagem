import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/account';
import { getPublicUrl } from '@/lib/public-url';
import { encrypt } from '@/lib/whatsapp/encryption';
import { exchangeInstagramCode } from '@/lib/social/instagram';

function validState(state: string, accountId: string, userId: string) {
  const parts = state.split('.');
  if (parts.length !== 4) return false;
  const [stateAccountId, stateUserId, issuedAt, signature] = parts;
  const age = Date.now() - Number(issuedAt);
  if (stateAccountId !== accountId || stateUserId !== userId || !Number.isFinite(age) || age < 0 || age > 10 * 60_000) return false;
  const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${stateAccountId}.${stateUserId}.${issuedAt}`).digest('base64url');
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function GET(request: Request) {
  const target = new URL('/marketing/social-planner', new URL(request.url).origin);
  try {
    const ctx = await requireRole('admin');
    const query = new URL(request.url).searchParams;
    const code = query.get('code') || '';
    const state = query.get('state') || '';
    if (!code || !validState(state, ctx.accountId, ctx.userId)) throw new Error('A validaÃ§Ã£o da ligaÃ§Ã£o expirou. Tente novamente.');
    const redirectUri = getPublicUrl('/api/social/instagram/callback', new URL(request.url).origin);
    const connection = await exchangeInstagramCode(code, redirectUri);
    const expiresAt = connection.expiresIn ? new Date(Date.now() + connection.expiresIn * 1000).toISOString() : null;
    const { error } = await ctx.supabase.from('social_instagram_connections').upsert({
      account_id: ctx.accountId,
      facebook_page_id: connection.pageId,
      instagram_account_id: connection.instagramId,
      instagram_username: connection.username,
      access_token_encrypted: encrypt(connection.accessToken),
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'account_id' });
    if (error) throw error;
    target.searchParams.set('instagram', 'connected');
  } catch (error) {
    target.searchParams.set('instagram', 'error');
    target.searchParams.set('message', error instanceof Error ? error.message : 'NÃ£o foi possÃ­vel ligar o Instagram.');
  }
  return NextResponse.redirect(target);
}

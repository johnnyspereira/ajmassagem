import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getPublicUrl } from '@/lib/public-url';

function stateFor(accountId: string, userId: string) {
  const issuedAt = Date.now().toString();
  const payload = `${accountId}.${userId}.${issuedAt}`;
  const secret = process.env.META_APP_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('Configure META_APP_SECRET para ligar o Instagram.');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const appId = process.env.META_APP_ID;
    if (!appId) return NextResponse.json({ error: 'Configure META_APP_ID antes de ligar o Instagram.' }, { status: 503 });
    const redirectUri = getPublicUrl('/api/social/instagram/callback', new URL(request.url).origin);
    const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', stateFor(ctx.accountId, ctx.userId));
    url.searchParams.set('scope', 'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish');
    return NextResponse.json({ url: url.toString() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

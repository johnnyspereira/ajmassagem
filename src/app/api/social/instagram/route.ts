import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const { data, error } = await ctx.supabase
      .from('social_instagram_connections')
      .select('facebook_page_id,instagram_account_id,instagram_username,token_expires_at,connected_at')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connection: data ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('admin');
    const { error } = await ctx.supabase
      .from('social_instagram_connections')
      .delete()
      .eq('account_id', ctx.accountId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

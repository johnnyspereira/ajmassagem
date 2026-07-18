import { NextResponse } from 'next/server';
import {
  bindBaileysSessionContext,
  stopBaileysSession,
} from '@/lib/whatsapp/baileys';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    await stopBaileysSession(true);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

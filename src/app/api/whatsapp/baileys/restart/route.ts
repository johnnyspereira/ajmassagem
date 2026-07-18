import { NextResponse } from 'next/server';
import {
  bindBaileysSessionContext,
  restartBaileysSession,
} from '@/lib/whatsapp/baileys';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    const status = await restartBaileysSession();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}

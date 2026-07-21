import { NextResponse } from 'next/server';
import {
  bindBaileysSessionContext,
  restartBaileysSession,
} from '@/lib/whatsapp/baileys';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.restart({
        accountId: ctx.accountId,
        userId: ctx.userId,
      });
      return NextResponse.json(result);
    }

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    const status = await restartBaileysSession();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return toErrorResponse(error);
  }
}

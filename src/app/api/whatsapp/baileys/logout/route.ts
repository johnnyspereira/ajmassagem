import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function POST() {
  try {
    const ctx = await requireRole('admin');
    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.logout({
        accountId: ctx.accountId,
      });
      return NextResponse.json(result);
    }

    const { bindBaileysSessionContext, stopBaileysSession } = await import(
      '@/lib/whatsapp/baileys'
    );

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    await stopBaileysSession(true);
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

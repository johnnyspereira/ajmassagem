import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const autoStart = searchParams.get('autostart') !== 'false';
    if (remoteWhatsAppWorker.enabled()) {
      const status = await remoteWhatsAppWorker.status({
        accountId: ctx.accountId,
        userId: ctx.userId,
        autoStart,
      });
      return NextResponse.json(status);
    }

    const {
      bindBaileysSessionContext,
      getBaileysSessionStatus,
      startBaileysSession,
    } = await import('@/lib/whatsapp/baileys');

    bindBaileysSessionContext(ctx.accountId, ctx.userId);
    const status = autoStart
      ? await getBaileysSessionStatus()
      : await startBaileysSession({
          accountId: ctx.accountId,
          userId: ctx.userId,
          autoStart: true,
          restoreOnly: true,
        });

    if (autoStart && !status.connected) {
      const nextStatus = await startBaileysSession({
        accountId: ctx.accountId,
        userId: ctx.userId,
        autoStart,
      });
      return NextResponse.json(nextStatus);
    }

    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error);
  }
}

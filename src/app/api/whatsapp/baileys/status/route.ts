import { NextResponse } from 'next/server';
import {
  bindBaileysSessionContext,
  getBaileysSessionStatus,
  startBaileysSession,
} from '@/lib/whatsapp/baileys';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const autoStart = searchParams.get('autostart') !== 'false';
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

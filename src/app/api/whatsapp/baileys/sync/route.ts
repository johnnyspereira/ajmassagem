import { NextResponse } from 'next/server';
import {
  bindBaileysSessionContext,
  startBaileysSession,
  syncBaileysHistory,
} from '@/lib/whatsapp/baileys';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    bindBaileysSessionContext(ctx.accountId, ctx.userId);

    const body = await request.json().catch(() => ({}));
    const chatLimit =
      typeof body.chat_limit === 'number' ? body.chat_limit : undefined;
    const messageLimit =
      typeof body.message_limit === 'number' ? body.message_limit : undefined;

    if (remoteWhatsAppWorker.enabled()) {
      const result = await remoteWhatsAppWorker.sync({
        accountId: ctx.accountId,
        userId: ctx.userId,
        chatLimit,
        messageLimit,
      });
      return NextResponse.json(result);
    }

    const status = await startBaileysSession({
      accountId: ctx.accountId,
      userId: ctx.userId,
      autoStart: true,
    });

    if (!status.connected) {
      return NextResponse.json(
        { error: 'WhatsApp QR session is not connected.', status },
        { status: 400 }
      );
    }

    const result = await syncBaileysHistory({ chatLimit, messageLimit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

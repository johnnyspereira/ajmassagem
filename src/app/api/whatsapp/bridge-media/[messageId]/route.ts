import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { mediaResponse } from '@/lib/inbox/media-response';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const context = await getCurrentAccount();
    const rows = await selectRows<
      (RowDataPacket & {
        mime_type: string;
        filename: string | null;
        data: Buffer;
      })[]
    >(
      `SELECT mime_type,filename,data FROM whatsapp_bridge_media
       WHERE message_id=? AND account_id=? LIMIT 1`,
      [messageId, context.account.id]
    );
    const media = rows[0];
    if (!media) {
      return Response.json({ error: 'Media not found.' }, { status: 404 });
    }

    return mediaResponse(request, media);
  } catch (error) {
    console.error('[whatsapp-bridge-media] failed:', error);
    return toErrorResponse(error);
  }
}

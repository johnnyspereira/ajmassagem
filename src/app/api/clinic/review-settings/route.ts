import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { normalizeReviewUrl, parseReviewMode } from '@/lib/clinic/review-link';
import { selectRows, transaction } from '@/lib/mysql/db';
import {
  ensureReviewLinkSchema,
  reviewLinkSchemaError,
} from '@/lib/clinic/review-link-schema';
import type { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const { accountId } = await requireRole('admin');
    await ensureReviewLinkSchema();
    const rows = await selectRows<RowDataPacket[]>(
      'SELECT review_link_mode,review_google_url FROM clinic_communication_settings WHERE account_id=?',
      [accountId]
    );
    const data = rows[0];
    if (!data)
      return Response.json(
        {
          error:
            'Configure primeiro a Comunicação da Clínica em Definições → Clínica → Comunicação.',
        },
        { status: 409 }
      );
    return Response.json(
      {
        mode: data?.review_link_mode || 'system',
        googleUrl: data?.review_google_url || '',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return reviewLinkSchemaError(error) ?? toErrorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    let mode, googleUrl;
    try {
      mode = parseReviewMode(body?.mode);
      if (mode === 'google') googleUrl = normalizeReviewUrl(body?.googleUrl);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Destino inválido.' },
        { status: 400 }
      );
    }
    await ensureReviewLinkSchema();
    const saved = await transaction(async (connection) => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        'SELECT account_id FROM clinic_communication_settings WHERE account_id=? FOR UPDATE',
        [accountId]
      );
      if (!rows.length) return false;
      await connection.execute(
        mode === 'google'
          ? 'UPDATE clinic_communication_settings SET review_link_mode=?,review_google_url=? WHERE account_id=?'
          : 'UPDATE clinic_communication_settings SET review_link_mode=? WHERE account_id=?',
        mode === 'google' ? [mode, googleUrl!, accountId] : [mode, accountId]
      );
      return true;
    });
    if (!saved)
      return Response.json(
        {
          error:
            'Configure primeiro a Comunicação da Clínica em Definições → Clínica → Comunicação.',
        },
        { status: 409 }
      );
    return Response.json(
      { saved: true, mode, ...(mode === 'google' ? { googleUrl } : {}) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return reviewLinkSchemaError(error) ?? toErrorResponse(error);
  }
}

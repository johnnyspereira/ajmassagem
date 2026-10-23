import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  RenewalError,
  renewalPreview,
  renewalHistory,
  sendVoucherRenewal,
} from '@/lib/clinic/voucher-renewal';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireRole('admin');
    const { id } = await params;
    const preview = await renewalPreview(accountId, id);
    const history = await renewalHistory(accountId, id);
    const { row: _row, ...safe } = preview;
    void _row;
    return Response.json(
      {
        ...safe,
        history,
        mbwayPhone: process.env.RENEWAL_MBWAY_PHONE || '935864343',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (body?.confirm !== true || typeof body?.message !== 'string')
      throw new RenewalError('Confirme o envio e reveja a mensagem.');
    return Response.json(
      await sendVoucherRenewal(
        accountId,
        userId,
        id,
        body.message,
        typeof body.mbwayPhone === 'string' ? body.mbwayPhone : ''
      )
    );
  } catch (error) {
    if (error instanceof RenewalError)
      return Response.json({ error: error.message }, { status: 409 });
    return toErrorResponse(error);
  }
}

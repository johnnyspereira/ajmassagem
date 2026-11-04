import {
  requirePortalAccess,
  portalErrorResponse,
  PortalError,
} from '@/lib/portal/server';
import { recordAccess } from '@/lib/portal/access-events';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { access } = await requirePortalAccess(slug);
    const body = await request.json().catch(() => null);
    const campaignId =
      typeof body?.campaignId === 'string' ? body.campaignId : null;
    if (campaignId) {
      const rows = await selectRows<RowDataPacket[]>(
        "SELECT id FROM portal_campaigns WHERE id=? AND account_id=? AND status='published'",
        [campaignId, access.account_id]
      );
      if (!rows.length) throw new PortalError('Campanha indisponível.', 404);
    }
    const tab =
      typeof body?.tab === 'string' && /^[a-z-]{1,40}$/.test(body.tab)
        ? body.tab
        : 'home';
    await recordAccess({
      accountId: access.account_id,
      contactId: access.contact_id,
      scope: campaignId ? 'campaign' : 'portal',
      resource: campaignId || tab,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

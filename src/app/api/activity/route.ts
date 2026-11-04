import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';
import { recordAccess } from '@/lib/portal/access-events';
import { ensurePortalStoreSchema } from '@/lib/portal/store-schema';

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('viewer');
    const body = await request.json().catch(() => null);
    const path =
      typeof body?.path === 'string'
        ? body.path.split('?')[0].split('#')[0]
        : '';
    if (!/^\/[a-z0-9/-]{0,79}$/i.test(path))
      return Response.json({ error: 'Página inválida.' }, { status: 400 });
    await recordAccess({ accountId, userId, scope: 'crm', resource: path });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    await ensurePortalStoreSchema();
    const params = new URL(request.url).searchParams;
    const days = Math.min(90, Math.max(1, Number(params.get('days')) || 30));
    const scope = ['crm', 'portal', 'campaign'].includes(
      params.get('scope') || ''
    )
      ? params.get('scope')!
      : '';
    const page = Math.min(
      10000,
      Math.max(0, Math.floor(Number(params.get('page')) || 0))
    );
    const search = (params.get('search') || '').slice(0, 100);
    const where = `e.account_id=? AND e.occurred_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY)
      AND (?='' OR e.scope=?) AND (?='' OR COALESCE(c.name,p.full_name,u.email,'') LIKE ? OR COALESCE(pc.title,e.resource_id) LIKE ?)`;
    const values = [
      accountId,
      days,
      scope,
      scope,
      search,
      `%${search}%`,
      `%${search}%`,
    ];
    const joins = `LEFT JOIN contacts c ON c.id=e.contact_id AND c.account_id=e.account_id
      LEFT JOIN profiles p ON p.user_id=e.user_id AND p.account_id=e.account_id
      LEFT JOIN app_users u ON u.id=p.user_id
      LEFT JOIN portal_campaigns pc ON pc.id=e.resource_id AND pc.account_id=e.account_id AND e.scope='campaign'`;
    const [rows, counts] = await Promise.all([
      selectRows<RowDataPacket[]>(
        `SELECT e.id,e.scope,e.resource_id,e.occurred_at,e.contact_id,
        COALESCE(c.name,p.full_name,u.email,'Cliente') actor_name,pc.title campaign_title
        FROM crm_access_events e ${joins} WHERE ${where} ORDER BY e.occurred_at DESC LIMIT 50 OFFSET ${page * 50}`,
        values
      ),
      selectRows<RowDataPacket[]>(
        `SELECT COUNT(*) total,COUNT(DISTINCT e.contact_id) clients,COUNT(DISTINCT e.user_id) staff,
        SUM(e.scope='campaign') campaign_views FROM crm_access_events e ${joins} WHERE ${where}`,
        values
      ),
    ]);
    return Response.json(
      { rows, summary: counts[0], page },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

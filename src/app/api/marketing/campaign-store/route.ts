import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';
import { ensurePortalStoreSchema } from '@/lib/portal/store-schema';
import type { RowDataPacket } from 'mysql2';
export async function GET() {
  try {
    const { accountId } = await requireRole('viewer');
    await ensurePortalStoreSchema();
    const [services, packs] = await Promise.all([
      selectRows<RowDataPacket[]>(
        'SELECT id,name FROM clinic_services WHERE account_id=? AND is_active=1 ORDER BY name',
        [accountId]
      ),
      selectRows<RowDataPacket[]>(
        'SELECT id,name FROM finance_pack_catalog WHERE account_id=? AND is_active=1 ORDER BY name',
        [accountId]
      ),
    ]);
    return Response.json(
      { services, packs },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

import type { RowDataPacket } from 'mysql2/promise';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';

// Count sale quantities, never pack sessions or issued benefit balances.
const eligible = `i.account_id=? AND s.account_id=? AND i.item_type='pack'
  AND s.status NOT IN ('voided','refunded','cancelled')`;

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const params = new URL(request.url).searchParams;
    const packId = params.get('pack');
    const page = Number(params.get('page') || 1);
    if (
      (packId !== null && (!packId || packId.length > 64)) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1_000_000
    )
      return Response.json(
        { error: 'Filtro de pack ou pÃ¡gina invÃ¡lido.' },
        { status: 400 }
      );
    const headers = { 'Cache-Control': 'private, no-store' };
    if (!packId) {
      const rows = await selectRows<RowDataPacket[]>(
        `SELECT i.source_id pack_id, COALESCE(SUM(i.quantity),0) sold
         FROM finance_sale_items i JOIN finance_sales s ON s.id=i.sale_id
         JOIN finance_pack_catalog p ON p.id=i.source_id AND p.account_id=i.account_id
         WHERE ${eligible} GROUP BY i.source_id`,
        [accountId, accountId]
      );
      return Response.json(
        {
          counts: Object.fromEntries(
            rows.map((row) => [row.pack_id, Number(row.sold)])
          ),
        },
        { headers }
      );
    }
    const packs = await selectRows<RowDataPacket[]>(
      'SELECT id,name,reference FROM finance_pack_catalog WHERE id=? AND account_id=?',
      [packId, accountId]
    );
    if (!packs.length)
      return Response.json({ error: 'Pack nÃ£o encontrado.' }, { status: 404 });
    const totals = await selectRows<RowDataPacket[]>(
      `SELECT COALESCE(SUM(i.quantity),0) sold, COUNT(*) row_count, COUNT(DISTINCT s.id) sales
       FROM finance_sale_items i JOIN finance_sales s ON s.id=i.sale_id
       WHERE ${eligible} AND i.source_id=?`,
      [accountId, accountId, packId]
    );
    const rows = await selectRows<RowDataPacket[]>(
      `SELECT i.id,i.quantity,i.name_snapshot,i.line_total,s.id sale_id,s.sale_number,s.status,s.currency,s.created_at,
        c.id contact_id,c.name contact_name
       FROM finance_sale_items i JOIN finance_sales s ON s.id=i.sale_id
       LEFT JOIN contacts c ON c.id=s.contact_id AND c.account_id=s.account_id
       WHERE ${eligible} AND i.source_id=? ORDER BY s.created_at DESC,i.id DESC LIMIT 50 OFFSET ?`,
      [accountId, accountId, packId, (page - 1) * 50]
    );
    return Response.json(
      {
        pack: packs[0],
        sold: Number(totals[0]?.sold || 0),
        sales: Number(totals[0]?.sales || 0),
        totalRows: Number(totals[0]?.row_count || 0),
        page,
        pageSize: 50,
        rows,
      },
      { headers }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

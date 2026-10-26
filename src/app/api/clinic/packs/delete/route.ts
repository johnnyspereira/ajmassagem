import type { RowDataPacket } from 'mysql2/promise';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== 'string' || !body.id || body.id.length > 64)
      return Response.json(
        { error: 'Indique o pack a excluir.' },
        { status: 400 }
      );
    const result = await transaction(async (connection) => {
      const [packs] = await connection.execute<RowDataPacket[]>(
        'SELECT id,name FROM finance_pack_catalog WHERE id=? AND account_id=? FOR UPDATE',
        [body.id, accountId]
      );
      if (!packs.length) return { status: 404, error: 'Pack não encontrado.' };
      const [usage] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM finance_client_packs WHERE pack_id=? AND account_id=? LIMIT 1 FOR UPDATE`,
        [body.id, accountId]
      );
      const [sales] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM finance_sale_items WHERE source_id=? AND account_id=? AND item_type='pack' LIMIT 1 FOR UPDATE",
        [body.id, accountId]
      );
      if (usage.length || sales.length)
        return {
          status: 409,
          error:
            'Este pack já está associado a clientes ou vendas. Use Desativar para o retirar de novas vendas e preservar as sessões e o histórico existentes.',
        };
      await connection.execute(
        'DELETE FROM finance_pack_catalog WHERE id=? AND account_id=?',
        [body.id, accountId]
      );
      return { status: 200, deleted: true };
    });
    return Response.json(result, { status: result.status });
  } catch (error) {
    if ((error as { code?: string })?.code === 'ER_ROW_IS_REFERENCED_2')
      return Response.json(
        {
          error:
            'Este pack está ligado a outros registos. Desative-o para preservar o histórico.',
        },
        { status: 409 }
      );
    return toErrorResponse(error);
  }
}

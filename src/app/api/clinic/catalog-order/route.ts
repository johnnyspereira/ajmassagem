import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import { catalogTables, type CatalogKind } from '@/lib/clinic/catalog-order';
import type { RowDataPacket } from 'mysql2';
import {
  ensureCatalogOrderSchema,
  catalogOrderSchemaError,
} from '@/lib/clinic/catalog-order-schema';

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.kind !== 'string' ||
      !Object.hasOwn(catalogTables, body.kind) ||
      !Array.isArray(body.ids) ||
      body.ids.length > 2000 ||
      body.ids.some(
        (id: unknown) => typeof id !== 'string' || !id || id.length > 64
      ) ||
      new Set(body.ids).size !== body.ids.length
    ) {
      return Response.json(
        { error: 'Ordem de catálogo inválida.' },
        { status: 400 }
      );
    }
    const table = catalogTables[body.kind as CatalogKind];
    await ensureCatalogOrderSchema(body.kind as CatalogKind);
    const updated = await transaction(async (connection) => {
      await connection.execute(
        'SELECT id FROM accounts WHERE id=? FOR UPDATE',
        [accountId]
      );
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM ${table} WHERE account_id=? FOR UPDATE`,
        [accountId]
      );
      const ids = new Set(rows.map((row) => row.id));
      if (
        rows.length !== body.ids.length ||
        body.ids.some((id: string) => !ids.has(id))
      )
        return false;
      for (const [position, id] of body.ids.entries())
        await connection.execute(
          `UPDATE ${table} SET sort_order=? WHERE id=? AND account_id=?`,
          [position, id, accountId]
        );
      return true;
    });
    return updated
      ? Response.json({ ok: true })
      : Response.json(
          { error: 'O catálogo mudou. Atualize a lista e volte a ordenar.' },
          { status: 409 }
        );
  } catch (error) {
    return catalogOrderSchemaError(error) || toErrorResponse(error);
  }
}

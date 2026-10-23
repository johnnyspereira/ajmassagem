import type { RowDataPacket } from 'mysql2';
import { mutate, selectRows } from '@/lib/mysql/db';
import { catalogTables, type CatalogKind } from './catalog-order';

const ready = new Map<CatalogKind, Promise<void>>();

/** DDL runs before the save transaction; existing catalog data and order are preserved. */
export function ensureCatalogOrderSchema(kind: CatalogKind) {
  if (!Object.hasOwn(catalogTables, kind))
    throw new Error('Invalid catalog kind');
  let pending = ready.get(kind);
  if (!pending) {
    pending = install(catalogTables[kind]).catch((error) => {
      ready.delete(kind);
      throw error;
    });
    ready.set(kind, pending);
  }
  return pending;
}

async function install(table: string) {
  const columns = await selectRows<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='sort_order'`,
    [table]
  );
  if (columns.length) return;
  try {
    // The identifier comes exclusively from catalogTables, never from request text.
    await mutate(
      `ALTER TABLE ${table} ADD COLUMN sort_order INT NOT NULL DEFAULT 1000000`
    );
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

export function catalogOrderSchemaError(error: unknown): Response | null {
  const code = (error as { code?: string })?.code;
  if (
    [
      'ER_TABLEACCESS_DENIED_ERROR',
      'ER_DBACCESS_DENIED_ERROR',
      'ER_ACCESS_DENIED_ERROR',
      'ER_SPECIFIC_ACCESS_DENIED_ERROR',
    ].includes(code || '')
  ) {
    return Response.json(
      {
        code: 'DATABASE_PERMISSION_DENIED',
        error:
          'A base de dados não permitiu guardar ou preparar a ordem do catálogo. Verifique as permissões SELECT, UPDATE e ALTER do utilizador MySQL no cPanel e tente novamente.',
      },
      { status: 503 }
    );
  }
  if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code || '')) {
    return Response.json(
      {
        code: 'SCHEMA_UPDATE_REQUIRED',
        error:
          'A estrutura do catálogo está incompleta. Execute as migrações MySQL pendentes no cPanel e tente novamente.',
      },
      { status: 503 }
    );
  }
  return null;
}

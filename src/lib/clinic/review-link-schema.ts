import type { RowDataPacket } from 'mysql2';
import { mutate, selectRows } from '@/lib/mysql/db';

const columns = [
  [
    'clinic_communication_settings',
    'review_link_mode',
    "ENUM('system','google') NOT NULL DEFAULT 'system'",
  ],
  ['clinic_communication_settings', 'review_google_url', 'TEXT NULL'],
  ['clinic_appointment_reviews', 'sent_link_mode', 'VARCHAR(16) NULL'],
  ['clinic_appointment_reviews', 'sent_link_url', 'TEXT NULL'],
] as const;
let ready: Promise<void> | undefined;

/** Prepare before transactions or sending; repair partial migration 057 safely. */
export function ensureReviewLinkSchema(): Promise<void> {
  if (!ready) {
    ready = install().catch((error) => {
      ready = undefined;
      throw error;
    });
  }
  return ready;
}

async function install() {
  const existing = await selectRows<RowDataPacket[]>(
    'SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?)',
    ['clinic_communication_settings', 'clinic_appointment_reviews']
  );
  for (const [table, column, definition] of columns) {
    if (
      existing.some(
        (row) => row.TABLE_NAME === table && row.COLUMN_NAME === column
      )
    )
      continue;
    try {
      // Identifiers and definitions are fixed here, never supplied by the browser.
      await mutate(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

export function reviewLinkSchemaError(error: unknown): Response | null {
  const code = (error as { code?: string } | null)?.code;
  const denied = [
    'ER_TABLEACCESS_DENIED_ERROR',
    'ER_DBACCESS_DENIED_ERROR',
    'ER_ACCESS_DENIED_ERROR',
    'ER_SPECIFIC_ACCESS_DENIED_ERROR',
  ].includes(code || '');
  if (
    denied ||
    ['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code || '')
  ) {
    return Response.json(
      {
        code: denied ? 'DATABASE_PERMISSION_DENIED' : 'SCHEMA_UPDATE_REQUIRED',
        error: denied
          ? 'A base de dados não permitiu preparar o link de avaliação. Verifique as permissões SELECT, UPDATE e ALTER do utilizador MySQL no cPanel, ou aplique a migração 057, e tente novamente.'
          : 'A estrutura das avaliações está incompleta. Aplique as migrações MySQL pendentes no cPanel e tente novamente.',
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  return null;
}

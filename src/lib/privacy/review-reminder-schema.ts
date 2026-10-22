import { mutate, selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';
let ready: Promise<void> | undefined;

/** Install only this feature's additive schema, even when startup migrations are disabled. */
export function ensurePrivacyReminderSchema() {
  if (!ready)
    ready = install().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
async function install() {
  const columns = await selectRows<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_portal_settings' AND COLUMN_NAME='privacy_review_auto_enabled'`
  );
  if (!columns.length) {
    try {
      await mutate(
        'ALTER TABLE client_portal_settings ADD COLUMN privacy_review_auto_enabled BOOLEAN NOT NULL DEFAULT FALSE'
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  const tables = await selectRows<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='privacy_review_reminders'`
  );
  if (!tables.length)
    await mutate(`CREATE TABLE IF NOT EXISTS privacy_review_reminders (
    account_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL,
    claimed_at DATETIME(3) NULL, last_sent_at DATETIME(3) NULL, last_error TEXT NULL,
    PRIMARY KEY(account_id,contact_id),
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
export function privacyReminderError(error: unknown): Response | null {
  const code = (error as { code?: string })?.code;
  if (
    [
      'ER_TABLEACCESS_DENIED_ERROR',
      'ER_DBACCESS_DENIED_ERROR',
      'ER_ACCESS_DENIED_ERROR',
      'ER_SPECIFIC_ACCESS_DENIED_ERROR',
    ].includes(code || '')
  )
    return Response.json(
      {
        error:
          'A base de dados recusou o acesso ou a instalação do painel. Verifique as permissões CREATE e ALTER do utilizador MySQL no cPanel.',
        code: 'DATABASE_PERMISSION_DENIED',
      },
      { status: 503 }
    );
  if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code || ''))
    return Response.json(
      {
        error:
          'Falta uma atualização anterior da base de dados. Execute as migrações MySQL pendentes no cPanel e tente novamente.',
        code: 'SCHEMA_UPDATE_REQUIRED',
      },
      { status: 503 }
    );
  return null;
}

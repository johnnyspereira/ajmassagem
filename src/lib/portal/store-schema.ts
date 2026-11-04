import type { RowDataPacket } from 'mysql2';
import { mutate, selectRows } from '@/lib/mysql/db';
let ready: Promise<void> | undefined;
export function ensurePortalStoreSchema() {
  if (!ready)
    ready = install().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
async function install() {
  const columns = await selectRows<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='portal_campaigns' AND COLUMN_NAME IN ('campaign_kind','commerce_validity_days')"
  );
  for (const [name, definition] of [
    ['campaign_kind', "VARCHAR(24) NOT NULL DEFAULT 'promotional'"],
    ['commerce_validity_days', 'INT NOT NULL DEFAULT 365'],
  ]) {
    if (columns.some((column) => column.COLUMN_NAME === name)) continue;
    try {
      await mutate(
        `ALTER TABLE portal_campaigns ADD COLUMN ${name} ${definition}`
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  const tables=await selectRows<RowDataPacket[]>("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crm_access_events'");
  if(!tables.length) await mutate(`CREATE TABLE IF NOT EXISTS crm_access_events (
    id CHAR(36) NOT NULL PRIMARY KEY, account_id CHAR(36) NOT NULL, actor_key VARCHAR(80) NOT NULL,
    contact_id CHAR(36) NULL,user_id CHAR(36) NULL,scope VARCHAR(24) NOT NULL,
    resource_id VARCHAR(80) NOT NULL DEFAULT '',time_bucket BIGINT NOT NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY crm_access_bucket(account_id,actor_key,scope,resource_id,time_bucket),
    KEY crm_access_account_date(account_id,occurred_at),
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const enrollmentColumns = await selectRows<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='portal_campaign_enrollments' AND COLUMN_NAME='payment_method'"
  );
  if (!enrollmentColumns.length) {
    try {
      await mutate(
        'ALTER TABLE portal_campaign_enrollments ADD COLUMN payment_method VARCHAR(16) NULL'
      );
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

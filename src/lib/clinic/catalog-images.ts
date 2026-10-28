import { mutate } from '@/lib/mysql/db';
let pending: Promise<void> | undefined;
export function ensureCatalogImages() {
  pending ??= mutate(`CREATE TABLE IF NOT EXISTS clinic_catalog_images (
    account_id CHAR(36) NOT NULL, kind VARCHAR(16) NOT NULL, item_id CHAR(36) NOT NULL,
    image_url VARCHAR(2048) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(account_id,kind,item_id), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
    .then(() => {})
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

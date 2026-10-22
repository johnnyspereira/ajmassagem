ALTER TABLE client_portal_settings ADD COLUMN IF NOT EXISTS privacy_review_auto_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS privacy_review_reminders (
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  claimed_at DATETIME(3) NULL,
  last_sent_at DATETIME(3) NULL,
  last_error TEXT NULL,
  PRIMARY KEY(account_id,contact_id),
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

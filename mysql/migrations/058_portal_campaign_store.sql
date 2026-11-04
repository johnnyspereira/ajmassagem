ALTER TABLE portal_campaigns ADD COLUMN campaign_kind VARCHAR(24) NOT NULL DEFAULT 'promotional';
ALTER TABLE portal_campaigns ADD COLUMN commerce_validity_days INT NOT NULL DEFAULT 365;
ALTER TABLE portal_campaign_enrollments ADD COLUMN payment_method VARCHAR(16) NULL;

CREATE TABLE IF NOT EXISTS crm_access_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  actor_key VARCHAR(80) NOT NULL,
  contact_id CHAR(36) NULL,
  user_id CHAR(36) NULL,
  scope VARCHAR(24) NOT NULL,
  resource_id VARCHAR(80) NOT NULL DEFAULT '',
  time_bucket BIGINT NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY crm_access_bucket(account_id,actor_key,scope,resource_id,time_bucket),
  KEY crm_access_account_date(account_id,occurred_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinic_voucher_renewals (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, appointment_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL, voucher_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL, created_by_user_id CHAR(36) NOT NULL,
  token CHAR(64) NOT NULL, amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'prepared', message TEXT NOT NULL, mbway_phone VARCHAR(20) NOT NULL,
  sale_id CHAR(36) NULL, payment_link_id CHAR(36) NULL, sent_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY renewal_source(account_id,voucher_id), UNIQUE KEY renewal_token(token),
  CONSTRAINT renewal_account_fk FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT renewal_contact_fk FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_sale_documents (
  id CHAR(36) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  sale_id CHAR(36) NOT NULL,
  uploaded_by_user_id CHAR(36) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  byte_size INT NOT NULL,
  storage_key VARCHAR(160) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX finance_sale_documents_sale(account_id,sale_id,created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

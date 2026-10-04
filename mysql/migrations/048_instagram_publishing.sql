CREATE TABLE IF NOT EXISTS social_instagram_connections (
  account_id CHAR(36) NOT NULL,
  facebook_page_id VARCHAR(255) NOT NULL,
  instagram_account_id VARCHAR(255) NOT NULL,
  instagram_username VARCHAR(255) NULL,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at DATETIME(3) NULL,
  connected_by CHAR(36) NULL,
  connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  UNIQUE KEY social_instagram_connections_ig_unique (instagram_account_id),
  CONSTRAINT social_instagram_connections_account_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT social_instagram_connections_profile_fk
    FOREIGN KEY (connected_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

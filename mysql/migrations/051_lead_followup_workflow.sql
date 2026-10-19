CREATE TABLE IF NOT EXISTS lead_workflow_settings (
  account_id CHAR(36) NOT NULL PRIMARY KEY,
  recovery_days INT NOT NULL DEFAULT 60,
  followup_days INT NOT NULL DEFAULT 3,
  templates JSON NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT lead_workflow_settings_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT lead_workflow_settings_actor_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_followups (
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  next_followup_at DATETIME(3) NULL,
  last_contacted_at DATETIME(3) NULL,
  notes TEXT NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id, contact_id),
  KEY lead_followups_due_idx (account_id, next_followup_at),
  CONSTRAINT lead_followups_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT lead_followups_contact_fk FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT lead_followups_actor_fk FOREIGN KEY (updated_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_followup_activities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  status VARCHAR(24) NOT NULL,
  contacted BOOLEAN NOT NULL DEFAULT FALSE,
  next_followup_at DATETIME(3) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY lead_followup_activities_contact_idx (account_id, contact_id, created_at),
  CONSTRAINT lead_followup_activities_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT lead_followup_activities_contact_fk FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT lead_followup_activities_actor_fk FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

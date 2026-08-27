ALTER TABLE contacts ADD COLUMN phone_normalized VARCHAR(50) NULL AFTER phone, ADD INDEX contacts_phone_normalized(account_id,phone_normalized);
ALTER TABLE ai_configs ADD COLUMN embeddings_api_key TEXT NULL AFTER api_key_encrypted;
ALTER TABLE referrals ADD COLUMN rejection_code VARCHAR(64) NULL AFTER rejection_reason;
ALTER TABLE referral_program_settings
 ADD COLUMN new_clients_only BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN campaign_starts_at DATETIME(3), ADD COLUMN campaign_ends_at DATETIME(3),
 ADD COLUMN public_privacy_text TEXT, ADD COLUMN minimum_qualifying_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE referral_rewards
 ADD COLUMN credited_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN available_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN reversed_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN reversed_at DATETIME(3), ADD COLUMN reversed_by_user_id CHAR(36), ADD COLUMN reversal_reason TEXT,
 ADD CONSTRAINT referral_reward_reversed_user_fk FOREIGN KEY(reversed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE client_portal_access
 ADD COLUMN requires_password_change BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN password_issued_at DATETIME(3), ADD COLUMN password_changed_at DATETIME(3),
 ADD COLUMN portal_auth_email VARCHAR(320), ADD UNIQUE KEY portal_auth_email_unique(portal_auth_email);
ALTER TABLE finance_invoice_requests
 ADD COLUMN invoice_document_path TEXT, ADD COLUMN invoice_file_name VARCHAR(255), ADD COLUMN invoice_file_size BIGINT,
 ADD COLUMN invoice_uploaded_at DATETIME(3);
ALTER TABLE finance_payables
 ADD COLUMN appointment_id CHAR(36), ADD COLUMN contact_id CHAR(36), ADD COLUMN deal_id CHAR(36), ADD COLUMN cash_movement_id CHAR(36),
 ADD COLUMN document_reference VARCHAR(255), ADD COLUMN payment_reference VARCHAR(255), ADD COLUMN installment_group_id CHAR(36),
 ADD COLUMN installment_number INT NOT NULL DEFAULT 1, ADD COLUMN installment_count INT NOT NULL DEFAULT 1,
 ADD COLUMN recurrence VARCHAR(32) NOT NULL DEFAULT 'none', ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual',
 ADD CONSTRAINT finance_payables_appointment_fk FOREIGN KEY(appointment_id) REFERENCES clinic_appointments(id) ON DELETE SET NULL,
 ADD CONSTRAINT finance_payables_contact_fk FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
 ADD CONSTRAINT finance_payables_deal_fk FOREIGN KEY(deal_id) REFERENCES deals(id) ON DELETE SET NULL,
 ADD CONSTRAINT finance_payables_cash_movement_fk FOREIGN KEY(cash_movement_id) REFERENCES finance_cash_movements(id) ON DELETE SET NULL;
ALTER TABLE finance_receivable_schedules
 ADD COLUMN appointment_id CHAR(36), ADD COLUMN deal_id CHAR(36), ADD COLUMN payment_id CHAR(36),
 ADD COLUMN document_reference VARCHAR(255), ADD COLUMN payment_method VARCHAR(32), ADD COLUMN payment_reference VARCHAR(255),
 ADD COLUMN installment_group_id CHAR(36), ADD COLUMN installment_number INT NOT NULL DEFAULT 1, ADD COLUMN installment_count INT NOT NULL DEFAULT 1,
 ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual',
 ADD CONSTRAINT finance_receivables_appointment_fk FOREIGN KEY(appointment_id) REFERENCES clinic_appointments(id) ON DELETE SET NULL,
 ADD CONSTRAINT finance_receivables_deal_fk FOREIGN KEY(deal_id) REFERENCES deals(id) ON DELETE SET NULL,
 ADD CONSTRAINT finance_receivables_payment_fk FOREIGN KEY(payment_id) REFERENCES finance_payments(id) ON DELETE SET NULL;
ALTER TABLE finance_cash_sessions ADD COLUMN expected_breakdown JSON, ADD COLUMN closing_breakdown JSON, ADD COLUMN reconciliation_breakdown JSON;
ALTER TABLE finance_cash_movements ADD COLUMN payment_method VARCHAR(32) NOT NULL DEFAULT 'cash', ADD COLUMN category VARCHAR(128), ADD COLUMN occurred_at DATETIME(3);

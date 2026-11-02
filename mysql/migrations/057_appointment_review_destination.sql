ALTER TABLE clinic_communication_settings
  ADD COLUMN review_link_mode ENUM('system','google') NOT NULL DEFAULT 'system',
  ADD COLUMN review_google_url TEXT NULL;

ALTER TABLE clinic_appointment_reviews
  ADD COLUMN sent_link_mode VARCHAR(16) NULL,
  ADD COLUMN sent_link_url TEXT NULL;

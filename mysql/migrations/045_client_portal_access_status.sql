-- Individual Portal 360 access control. The portal itself can remain active
-- while a professional blocks one specific client's login and bookings.
ALTER TABLE client_portal_access
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER contact_id,
  ADD COLUMN IF NOT EXISTS disabled_at DATETIME(3) NULL AFTER enabled,
  ADD COLUMN IF NOT EXISTS disabled_by CHAR(36) NULL AFTER disabled_at;

CREATE INDEX IF NOT EXISTS client_portal_access_enabled_idx
  ON client_portal_access(account_id, contact_id, enabled);

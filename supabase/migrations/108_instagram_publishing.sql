-- Per-account credentials for the official Meta Instagram Graph API.
CREATE TABLE IF NOT EXISTS social_instagram_connections (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  facebook_page_id TEXT NOT NULL,
  instagram_account_id TEXT NOT NULL UNIQUE,
  instagram_username TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  connected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE social_instagram_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_instagram_connections_read ON social_instagram_connections
  FOR SELECT USING (is_account_member(account_id));
CREATE POLICY social_instagram_connections_admin ON social_instagram_connections
  FOR ALL USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE TRIGGER social_instagram_connections_updated_at
  BEFORE UPDATE ON social_instagram_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

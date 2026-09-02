ALTER TABLE privacy_settings
  ADD COLUMN IF NOT EXISTS controller_tax_id VARCHAR(40) NULL;

INSERT INTO privacy_settings (
  account_id, controller_name, controller_email, controller_address,
  controller_tax_id, privacy_policy_url, privacy_notice_version, policy_summary
)
SELECT
  a.id, 'Johnny Pereira', 'geral@jpmassagem.pt',
  COALESCE(NULLIF(ccs.clinic_address, ''), 'Rua José Cardoso Pires, 35'),
  '313529183', 'https://jpmassagem.pt/privacidade', '1.0',
  'Política de privacidade da JP Massagem aplicável ao CRM, Portal 360, agenda, anamnese, faturação, benefícios, comunicações e programa de indicações.'
FROM accounts a
LEFT JOIN clinic_communication_settings ccs ON ccs.account_id = a.id
WHERE a.name = 'JP Massagem'
ON DUPLICATE KEY UPDATE
  controller_name = VALUES(controller_name),
  controller_email = VALUES(controller_email),
  controller_address = VALUES(controller_address),
  controller_tax_id = VALUES(controller_tax_id),
  dpo_email = NULL,
  privacy_policy_url = VALUES(privacy_policy_url),
  privacy_notice_version = VALUES(privacy_notice_version),
  policy_summary = VALUES(policy_summary),
  updated_at = CURRENT_TIMESTAMP(3);

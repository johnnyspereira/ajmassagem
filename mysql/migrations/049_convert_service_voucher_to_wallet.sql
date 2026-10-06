-- A service voucher may be converted once into reusable credit for its owner.
ALTER TABLE finance_wallet_transactions
  ADD COLUMN voucher_id CHAR(36) NULL AFTER wallet_id,
  ADD INDEX finance_wallet_voucher(voucher_id),
  ADD CONSTRAINT finance_wallet_voucher_fk
    FOREIGN KEY (voucher_id) REFERENCES finance_vouchers(id) ON DELETE SET NULL;

-- One ledger credit per voucher prevents duplicated balance on retries/double-clicks.
CREATE UNIQUE INDEX finance_wallet_voucher_once
  ON finance_wallet_transactions(voucher_id);

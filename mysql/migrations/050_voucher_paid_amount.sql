-- A service voucher may carry a catalogue/face value which is different from
-- what the client paid after discounts. Keep the paid value per voucher so a
-- conversion to wallet credit can never grant the catalogue price by mistake.
ALTER TABLE finance_vouchers
  ADD COLUMN issued_sale_item_id CHAR(36) NULL AFTER issued_sale_id,
  ADD COLUMN paid_amount DECIMAL(12,2) NULL AFTER initial_balance,
  ADD INDEX finance_vouchers_sale_item(issued_sale_item_id),
  ADD CONSTRAINT finance_vouchers_sale_item_fk
    FOREIGN KEY (issued_sale_item_id) REFERENCES finance_sale_items(id) ON DELETE SET NULL;

-- Backfill historical service vouchers when their source sale has a single
-- matching voucher line. The proportional factor includes sale-wide discounts
-- and partial payments. Imported paid sales intentionally use their final sale
-- value because no local payment row exists for them.
UPDATE finance_vouchers v
JOIN finance_sales s ON s.id = v.issued_sale_id
JOIN finance_sale_items i
  ON i.sale_id = v.issued_sale_id
 AND i.item_type = 'voucher'
 AND JSON_UNQUOTE(JSON_EXTRACT(i.metadata, '$.voucher_type')) = 'service'
 AND JSON_UNQUOTE(JSON_EXTRACT(i.metadata, '$.service_id')) = v.service_id
SET v.paid_amount = ROUND(
  (i.line_total / NULLIF(i.quantity, 0)) *
  (CASE WHEN s.is_historical = 1 THEN s.total_amount ELSE s.paid_amount END / NULLIF(s.total_amount, 0)),
  2
)
WHERE v.voucher_type = 'service'
  AND v.paid_amount IS NULL
  AND v.issued_sale_id IS NOT NULL;

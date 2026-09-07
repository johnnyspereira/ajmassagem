/*
  IMPORTAÇÃO MANUAL — CONTAS A PAGAR PRIVADAS
  Execute no phpMyAdmin depois de substituir @account_id pelo ID da conta
  apresentado por: SELECT id, name FROM accounts;

  Segurança:
  - Não altera nem elimina registos existentes.
  - Só insere uma parcela se não existir outra com a mesma referência,
    vencimento e número de parcela.
  - Todas as linhas entram como pendentes e usam DECIMAL(12,2).
*/

START TRANSACTION;

SET @account_id = 'COLE_AQUI_O_ID_DA_CONTA';
SET @created_by_user_id = NULL;
SET @card = 'Cartão terminado em 2387';

SET @g_booking_77 = UUID();
SET @g_pingo_34 = UUID();
SET @g_decathlon_35 = UUID();
SET @g_amelia_n_70 = UUID();
SET @g_darty_58 = UUID();
SET @g_amelia_s_60 = UUID();
SET @g_continente_18 = UUID();
SET @g_mercadona_95 = UUID();
SET @g_booking_95 = UUID();
SET @g_booking_133 = UUID();
SET @g_sumup_489 = UUID();
SET @g_sumup_488 = UUID();
SET @g_create_48 = UUID();
SET @g_amelia_s_75 = UUID();

/* Setembro de 2026 */
INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 2/3', 'Booking.com', 'Outros', CAST(25.77 AS DECIMAL(12,2)), 'EUR', '2026-09-09', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 77.00 EUR.'), 'private-booking-com-77-00', @g_booking_77, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-77-00' AND due_date='2026-09-09' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pingo Doce — parcela 2/3', 'Pingo Doce', 'Outros', CAST(11.49 AS DECIMAL(12,2)), 'EUR', '2026-09-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 34.00 EUR.'), 'private-pingo-doce-34-00', @g_pingo_34, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pingo-doce-34-00' AND due_date='2026-09-10' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Decathlon — parcela 2/3', 'Decathlon', 'Outros', CAST(11.63 AS DECIMAL(12,2)), 'EUR', '2026-09-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 35.00 EUR.'), 'private-decathlon-35-00', @g_decathlon_35, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-decathlon-35-00' AND due_date='2026-09-10' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pa V Amelia N — parcela 2/3', 'Pa V Amelia N', 'Outros', CAST(20.32 AS DECIMAL(12,2)), 'EUR', '2026-09-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 70.00 EUR.'), 'private-pa-v-amelia-n-70-00', @g_amelia_n_70, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pa-v-amelia-n-70-00' AND due_date='2026-09-10' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Darty — parcela 2/3', 'Darty', 'Outros', CAST(19.20 AS DECIMAL(12,2)), 'EUR', '2026-09-11', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 58.00 EUR.'), 'private-darty-58-00', @g_darty_58, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-darty-58-00' AND due_date='2026-09-11' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pa V Amelia S — parcela 2/3', 'Pa V Amelia S', 'Outros', CAST(20.00 AS DECIMAL(12,2)), 'EUR', '2026-09-14', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 60.00 EUR.'), 'private-pa-v-amelia-s-60-00', @g_amelia_s_60, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pa-v-amelia-s-60-00' AND due_date='2026-09-14' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Continente — parcela 2/3', 'Continente', 'Outros', CAST(2.85 AS DECIMAL(12,2)), 'EUR', '2026-09-16', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 18.00 EUR.'), 'private-continente-18-00', @g_continente_18, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-continente-18-00' AND due_date='2026-09-16' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Mercadona — parcela 2/3', 'Mercadona', 'Outros', CAST(19.89 AS DECIMAL(12,2)), 'EUR', '2026-09-16', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 95.00 EUR.'), 'private-mercadona-95-00', @g_mercadona_95, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-mercadona-95-00' AND due_date='2026-09-16' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 2/3', 'Booking.com', 'Outros', CAST(32.17 AS DECIMAL(12,2)), 'EUR', '2026-09-19', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 95.00 EUR.'), 'private-booking-com-95-00', @g_booking_95, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-95-00' AND due_date='2026-09-19' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 2/3', 'Booking.com', 'Outros', CAST(45.00 AS DECIMAL(12,2)), 'EUR', '2026-09-20', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 133.00 EUR.'), 'private-booking-com-133-00', @g_booking_133, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-133-00' AND due_date='2026-09-20' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'SumUp *AJMassagem — parcela 2/3', 'SumUp *AJMassagem', 'Outros', CAST(110.63 AS DECIMAL(12,2)), 'EUR', '2026-09-22', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 489.00 EUR.'), 'private-sumup-ajmassagem-489-00', @g_sumup_489, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-sumup-ajmassagem-489-00' AND due_date='2026-09-22' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'SumUp *AJMassagem — parcela 2/3', 'SumUp *AJMassagem', 'Outros', CAST(79.34 AS DECIMAL(12,2)), 'EUR', '2026-09-23', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 488.00 EUR.'), 'private-sumup-ajmassagem-488-00', @g_sumup_488, 2, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-sumup-ajmassagem-488-00' AND due_date='2026-09-23' AND installment_number=2 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'CREATE — parcela 3/3', 'CREATE', 'Outros', CAST(15.97 AS DECIMAL(12,2)), 'EUR', '2026-09-28', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 48.00 EUR.'), 'private-create-48-00', @g_create_48, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-create-48-00' AND due_date='2026-09-28' AND installment_number=3 AND installment_count=3);

/* Outubro de 2026 */
INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pa V Amelia S — parcela 3/3', 'Pa V Amelia S', 'Outros', CAST(25.01 AS DECIMAL(12,2)), 'EUR', '2026-10-05', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 75.00 EUR.'), 'private-pa-v-amelia-s-75-00', @g_amelia_s_75, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pa-v-amelia-s-75-00' AND due_date='2026-10-05' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 3/3', 'Booking.com', 'Outros', CAST(25.78 AS DECIMAL(12,2)), 'EUR', '2026-10-09', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 77.00 EUR.'), 'private-booking-com-77-00', @g_booking_77, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-77-00' AND due_date='2026-10-09' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pingo Doce — parcela 3/3', 'Pingo Doce', 'Outros', CAST(11.49 AS DECIMAL(12,2)), 'EUR', '2026-10-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 34.00 EUR.'), 'private-pingo-doce-34-00', @g_pingo_34, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pingo-doce-34-00' AND due_date='2026-10-10' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pa V Amelia N — parcela 3/3', 'Pa V Amelia N', 'Outros', CAST(20.32 AS DECIMAL(12,2)), 'EUR', '2026-10-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 70.00 EUR.'), 'private-pa-v-amelia-n-70-00', @g_amelia_n_70, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pa-v-amelia-n-70-00' AND due_date='2026-10-10' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Decathlon — parcela 3/3', 'Decathlon', 'Outros', CAST(11.64 AS DECIMAL(12,2)), 'EUR', '2026-10-10', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 35.00 EUR.'), 'private-decathlon-35-00', @g_decathlon_35, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-decathlon-35-00' AND due_date='2026-10-10' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Darty — parcela 3/3', 'Darty', 'Outros', CAST(19.21 AS DECIMAL(12,2)), 'EUR', '2026-10-11', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 58.00 EUR.'), 'private-darty-58-00', @g_darty_58, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-darty-58-00' AND due_date='2026-10-11' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Pa V Amelia S — parcela 3/3', 'Pa V Amelia S', 'Outros', CAST(20.01 AS DECIMAL(12,2)), 'EUR', '2026-10-14', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 60.00 EUR.'), 'private-pa-v-amelia-s-60-00', @g_amelia_s_60, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-pa-v-amelia-s-60-00' AND due_date='2026-10-14' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Continente — parcela 3/3', 'Continente', 'Outros', CAST(2.85 AS DECIMAL(12,2)), 'EUR', '2026-10-16', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 18.00 EUR.'), 'private-continente-18-00', @g_continente_18, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-continente-18-00' AND due_date='2026-10-16' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Mercadona — parcela 3/3', 'Mercadona', 'Outros', CAST(19.90 AS DECIMAL(12,2)), 'EUR', '2026-10-16', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 95.00 EUR.'), 'private-mercadona-95-00', @g_mercadona_95, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-mercadona-95-00' AND due_date='2026-10-16' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 3/3', 'Booking.com', 'Outros', CAST(31.18 AS DECIMAL(12,2)), 'EUR', '2026-10-17', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 95.00 EUR.'), 'private-booking-com-95-00', @g_booking_95, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-95-00' AND due_date='2026-10-17' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'Booking.com — parcela 3/3', 'Booking.com', 'Outros', CAST(44.01 AS DECIMAL(12,2)), 'EUR', '2026-10-18', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 133.00 EUR.'), 'private-booking-com-133-00', @g_booking_133, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-booking-com-133-00' AND due_date='2026-10-18' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'SumUp *AJMassagem — parcela 3/3', 'SumUp *AJMassagem', 'Outros', CAST(108.63 AS DECIMAL(12,2)), 'EUR', '2026-10-22', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 489.00 EUR.'), 'private-sumup-ajmassagem-489-00', @g_sumup_489, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-sumup-ajmassagem-489-00' AND due_date='2026-10-22' AND installment_number=3 AND installment_count=3);

INSERT INTO finance_payables (id, account_id, description, supplier, category, amount, currency, due_date, status, payment_method, notes, document_reference, installment_group_id, installment_number, installment_count, source, created_by_user_id)
SELECT UUID(), @account_id, 'SumUp *AJMassagem — parcela 3/3', 'SumUp *AJMassagem', 'Outros', CAST(78.35 AS DECIMAL(12,2)), 'EUR', '2026-10-23', 'pending', 'card_2387', CONCAT(@card, '. Compra total: 488.00 EUR.'), 'private-sumup-ajmassagem-488-00', @g_sumup_488, 3, 3, 'manual', @created_by_user_id
WHERE NOT EXISTS (SELECT 1 FROM finance_payables WHERE account_id=@account_id AND document_reference='private-sumup-ajmassagem-488-00' AND due_date='2026-10-23' AND installment_number=3 AND installment_count=3);

/* Validação: deve devolver 26 linhas e total pendente de 832.64 EUR. */
SELECT supplier AS estabelecimento, due_date AS data_vencimento,
       installment_number AS parcela_atual, installment_count AS total_parcelas,
       amount AS valor_parcela, status
FROM finance_payables
WHERE account_id = @account_id
  AND document_reference LIKE 'private-%'
  AND due_date BETWEEN '2026-09-01' AND '2026-10-31'
ORDER BY due_date ASC;

SELECT CAST(SUM(amount) AS DECIMAL(12,2)) AS total_pendente_esperado_832_64
FROM finance_payables
WHERE account_id = @account_id
  AND document_reference LIKE 'private-%'
  AND due_date BETWEEN '2026-09-01' AND '2026-10-31'
  AND status = 'pending';

COMMIT;

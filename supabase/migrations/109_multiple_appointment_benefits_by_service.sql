-- Permite que uma marcação use benefícios diferentes por serviço.
-- Ex.: serviço principal com voucher A e serviço adicional com voucher B.

DROP INDEX IF EXISTS finance_appointment_one_active_benefit;

CREATE UNIQUE INDEX IF NOT EXISTS finance_appointment_service_one_active_benefit
  ON finance_appointment_benefits(appointment_id, service_id)
  WHERE status IN ('reserved', 'consumed');

CREATE INDEX IF NOT EXISTS finance_appointment_benefits_appointment_service
  ON finance_appointment_benefits(appointment_id, service_id, status);

NOTIFY pgrst, 'reload schema';

-- Reserva um segundo benefício sem alterar os benefícios já reservados para os
-- outros serviços da mesma marcação.
CREATE OR REPLACE FUNCTION reserve_appointment_benefit_code_for_service(
  p_appointment_id UUID,
  p_service_id UUID,
  p_code TEXT,
  p_pin TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_appointment clinic_appointments;
  v_voucher finance_vouchers;
  v_pack finance_client_packs;
  v_balance finance_client_pack_balances;
  v_result finance_appointment_benefits;
  v_reserved NUMERIC(12,2);
  v_sessions INTEGER;
BEGIN
  SELECT * INTO v_appointment FROM clinic_appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT is_account_member(v_appointment.account_id, 'agent') THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
  IF v_appointment.contact_id IS NULL THEN
    RAISE EXCEPTION 'Appointment requires a client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM clinic_appointment_services
    WHERE appointment_id = p_appointment_id AND service_id = p_service_id
  ) AND v_appointment.service_id IS DISTINCT FROM p_service_id THEN
    RAISE EXCEPTION 'Service is not part of this appointment';
  END IF;

  UPDATE finance_appointment_benefits
  SET status='released', released_at=NOW(), updated_at=NOW()
  WHERE appointment_id=p_appointment_id AND service_id=p_service_id AND status='reserved';

  SELECT * INTO v_voucher FROM finance_vouchers
  WHERE account_id=v_appointment.account_id AND owner_contact_id=v_appointment.contact_id
    AND UPPER(code)=UPPER(BTRIM(p_code)) AND pin_code=BTRIM(p_pin)
    AND status='active' AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE;
  IF FOUND THEN
    IF v_voucher.voucher_type='service' AND v_voucher.service_id IS DISTINCT FROM p_service_id THEN
      RAISE EXCEPTION 'Voucher is not valid for this service';
    END IF;
    v_reserved := CASE WHEN v_voucher.voucher_type='service' THEN 0 ELSE LEAST(v_appointment.price, v_voucher.current_balance) END;
    IF v_voucher.voucher_type <> 'service' AND v_reserved <= 0 THEN RAISE EXCEPTION 'Voucher has no available balance'; END IF;
    INSERT INTO finance_appointment_benefits(account_id,appointment_id,contact_id,benefit_type,voucher_id,service_id,reserved_amount,created_by_user_id)
    VALUES(v_appointment.account_id,p_appointment_id,v_appointment.contact_id,'voucher',v_voucher.id,p_service_id,v_reserved,auth.uid())
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  SELECT * INTO v_pack FROM finance_client_packs
  WHERE account_id=v_appointment.account_id AND contact_id=v_appointment.contact_id
    AND UPPER(code)=UPPER(BTRIM(p_code)) AND pin_code=BTRIM(p_pin)
    AND status='active' AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid benefit code or PIN'; END IF;
  SELECT * INTO v_balance FROM finance_client_pack_balances
  WHERE client_pack_id=v_pack.id AND service_id=p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pack does not include this service'; END IF;
  SELECT COALESCE(SUM(reserved_sessions),0) INTO v_sessions
  FROM finance_appointment_benefits WHERE client_pack_balance_id=v_balance.id AND status='reserved';
  IF v_balance.remaining_sessions-v_sessions < 1 THEN RAISE EXCEPTION 'Pack has no available sessions'; END IF;
  INSERT INTO finance_appointment_benefits(account_id,appointment_id,contact_id,benefit_type,client_pack_id,client_pack_balance_id,service_id,reserved_sessions,created_by_user_id)
  VALUES(v_appointment.account_id,p_appointment_id,v_appointment.contact_id,'pack',v_pack.id,v_balance.id,p_service_id,1,auth.uid())
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_appointment_benefit_code_for_service(UUID,UUID,TEXT,TEXT) TO authenticated;

-- Liquida todos os benefÃ­cios reservados da marcaÃ§Ã£o (um por serviÃ§o).
CREATE OR REPLACE FUNCTION settle_appointment_benefit(
  p_appointment_id UUID,
  p_action TEXT
)
RETURNS finance_appointment_benefits
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_benefit finance_appointment_benefits;
  v_last finance_appointment_benefits;
  v_voucher finance_vouchers;
BEGIN
  IF p_action NOT IN ('consume','release') THEN RAISE EXCEPTION 'Invalid settlement action'; END IF;
  FOR v_benefit IN
    SELECT * FROM finance_appointment_benefits
    WHERE appointment_id=p_appointment_id AND status='reserved'
    ORDER BY created_at FOR UPDATE
  LOOP
    IF NOT is_account_member(v_benefit.account_id, 'agent') THEN RAISE EXCEPTION 'Benefit not found'; END IF;
    IF p_action='release' THEN
      UPDATE finance_appointment_benefits SET status='released', released_at=NOW(), updated_at=NOW()
      WHERE id=v_benefit.id RETURNING * INTO v_last;
    ELSE
      IF v_benefit.benefit_type='voucher' THEN
        SELECT * INTO v_voucher FROM finance_vouchers WHERE id=v_benefit.voucher_id FOR UPDATE;
        IF v_voucher.voucher_type='service' THEN
          UPDATE finance_vouchers SET remaining_uses=remaining_uses-1,
            status=CASE WHEN remaining_uses-1=0 THEN 'used' ELSE 'active' END,
            current_balance=CASE WHEN remaining_uses-1=0 THEN 0 ELSE current_balance END, updated_at=NOW()
          WHERE id=v_voucher.id AND remaining_uses>=1;
        ELSE
          UPDATE finance_vouchers SET current_balance=current_balance-v_benefit.reserved_amount,
            status=CASE WHEN current_balance-v_benefit.reserved_amount=0 THEN 'used' ELSE 'active' END, updated_at=NOW()
          WHERE id=v_voucher.id AND current_balance>=v_benefit.reserved_amount;
        END IF;
        IF NOT FOUND THEN RAISE EXCEPTION 'Voucher is no longer available'; END IF;
      ELSE
        UPDATE finance_client_pack_balances SET used_sessions=used_sessions+v_benefit.reserved_sessions,
          remaining_sessions=remaining_sessions-v_benefit.reserved_sessions
        WHERE id=v_benefit.client_pack_balance_id AND remaining_sessions>=v_benefit.reserved_sessions;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pack is no longer available'; END IF;
        IF NOT EXISTS (SELECT 1 FROM finance_client_pack_balances WHERE client_pack_id=v_benefit.client_pack_id AND remaining_sessions>0) THEN
          UPDATE finance_client_packs SET status='consumed' WHERE id=v_benefit.client_pack_id;
        END IF;
      END IF;
      UPDATE finance_appointment_benefits SET status='consumed', consumed_at=NOW(), updated_at=NOW()
      WHERE id=v_benefit.id RETURNING * INTO v_last;
    END IF;
  END LOOP;
  IF p_action='consume' THEN UPDATE clinic_appointments SET paid_at=COALESCE(paid_at,NOW()), updated_at=NOW() WHERE id=p_appointment_id; END IF;
  RETURN v_last;
END;
$$;
GRANT EXECUTE ON FUNCTION settle_appointment_benefit(UUID,TEXT) TO authenticated;

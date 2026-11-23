-- Permite que uma marcação use benefícios diferentes por serviço.
-- Ex.: serviço principal com voucher A e serviço adicional com voucher B.

DROP INDEX IF EXISTS finance_appointment_one_active_benefit;

CREATE UNIQUE INDEX IF NOT EXISTS finance_appointment_service_one_active_benefit
  ON finance_appointment_benefits(appointment_id, service_id)
  WHERE status IN ('reserved', 'consumed');

CREATE INDEX IF NOT EXISTS finance_appointment_benefits_appointment_service
  ON finance_appointment_benefits(appointment_id, service_id, status);

NOTIFY pgrst, 'reload schema';

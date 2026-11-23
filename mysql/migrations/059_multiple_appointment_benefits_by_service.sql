-- Permite um voucher/pack ativo por serviço dentro da mesma marcação.
-- A aplicação valida a compatibilidade e reserva cada linha com service_id.
ALTER TABLE finance_appointment_benefits
  ADD INDEX finance_benefits_appointment_service (appointment_id, service_id, status);

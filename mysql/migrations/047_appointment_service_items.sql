-- A booking can contain more than one procedure. Keep the legacy
-- clinic_appointments.service_id as the primary procedure so existing Portal,
-- reminder, finance and reporting integrations remain compatible.
CREATE TABLE IF NOT EXISTS clinic_appointment_services (
  id CHAR(36) NOT NULL,
  appointment_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 0,
  original_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_offer BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY clinic_appointment_services_position_unique (appointment_id, position),
  KEY clinic_appointment_services_appointment_idx (appointment_id),
  KEY clinic_appointment_services_service_idx (service_id),
  CONSTRAINT clinic_appointment_services_appointment_fk
    FOREIGN KEY (appointment_id) REFERENCES clinic_appointments(id) ON DELETE CASCADE,
  CONSTRAINT clinic_appointment_services_service_fk
    FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE RESTRICT,
  CONSTRAINT clinic_appointment_services_duration_check CHECK (duration_minutes >= 0),
  CONSTRAINT clinic_appointment_services_price_check CHECK (price >= 0),
  CONSTRAINT clinic_appointment_services_original_price_check CHECK (original_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing and Portal-created bookings start with one, non-offer item.
INSERT INTO clinic_appointment_services
  (id, appointment_id, service_id, position, duration_minutes, original_price, price, is_offer)
SELECT UUID(), a.id, a.service_id, 0,
       COALESCE(s.duration_minutes, TIMESTAMPDIFF(MINUTE, a.scheduled_start, a.scheduled_end)),
       COALESCE(a.original_price, a.price, 0), a.price, FALSE
FROM clinic_appointments a
LEFT JOIN clinic_services s ON s.id = a.service_id
LEFT JOIN clinic_appointment_services i ON i.appointment_id = a.id
WHERE a.service_id IS NOT NULL AND i.id IS NULL;

DROP TRIGGER IF EXISTS clinic_appointments_create_primary_item;
CREATE TRIGGER clinic_appointments_create_primary_item
AFTER INSERT ON clinic_appointments
FOR EACH ROW
  INSERT INTO clinic_appointment_services
    (id, appointment_id, service_id, position, duration_minutes, original_price, price, is_offer)
  SELECT UUID(), NEW.id, NEW.service_id, 0,
         COALESCE(s.duration_minutes, TIMESTAMPDIFF(MINUTE, NEW.scheduled_start, NEW.scheduled_end)),
         COALESCE(NEW.original_price, NEW.price, 0), NEW.price, FALSE
  FROM clinic_services s
  WHERE s.id = NEW.service_id;

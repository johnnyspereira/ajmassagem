import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
export async function assertAppointmentCollectible(
  connection: PoolConnection,
  accountId: string,
  appointmentId: string
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT id,paid_at,status FROM clinic_appointments WHERE id=? AND account_id=? FOR UPDATE',
    [appointmentId, accountId]
  );
  if (!rows.length) throw new Error('Marcação não encontrada nesta conta.');
  if (rows[0].paid_at)
    throw new Error(
      'Esta marcação já está paga. Consulte a venda original no Financeiro.'
    );
  if (rows[0].status === 'cancelled')
    throw new Error(
      'A marcação está cancelada. Não é possível receber este atendimento.'
    );
  const [settled] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM finance_sales WHERE account_id=? AND appointment_id=? AND status='paid' LIMIT 1",
    [accountId, appointmentId]
  );
  const [benefits] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM finance_appointment_benefits WHERE account_id=? AND appointment_id=? AND status='consumed' LIMIT 1",
    [accountId, appointmentId]
  );
  if (settled.length || benefits.length)
    throw new Error(
      'Esta marcação já foi liquidada por pagamento ou benefício.'
    );
}

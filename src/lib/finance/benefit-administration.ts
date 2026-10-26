import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export async function requireBenefitOwner(
  connection: PoolConnection,
  accountId: string,
  userId: string
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT user_id,full_name FROM profiles WHERE account_id=? AND user_id=? AND account_role='owner' FOR UPDATE",
    [accountId, userId]
  );
  if (!rows.length)
    throw new Error('Só o proprietário pode autorizar esta alteração.');
  return String(rows[0].full_name || 'Proprietário');
}

export async function validateBenefitExpiry(
  connection: PoolConnection,
  input: {
    accountId: string;
    userId: string;
    sourceId: string;
    kind: 'voucher' | 'pack';
    appointmentId: string;
    scheduledStart: Date | string;
    allowExpired: boolean;
    reason: string;
  }
) {
  const table =
    input.kind === 'voucher' ? 'finance_vouchers' : 'finance_client_packs';
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT expires_at,status FROM ${table} WHERE id=? AND account_id=? FOR UPDATE`,
    [input.sourceId, input.accountId]
  );
  const row = rows[0];
  if (!row || !['active', 'expired'].includes(row.status))
    throw new Error('Benefício inativo ou indisponível.');
  const expired =
    row.status === 'expired' ||
    (row.expires_at &&
      new Date(row.expires_at).getTime() <=
        Math.max(Date.now(), new Date(input.scheduledStart).getTime()));
  if (!expired) return;
  if (
    !input.allowExpired ||
    input.reason.trim().length < 5 ||
    input.reason.trim().length > 500
  )
    throw new Error(
      'Benefício expirado na data da sessão. É necessária autorização do proprietário e um motivo (5 a 500 caracteres).'
    );
  const ownerName = await requireBenefitOwner(
    connection,
    input.accountId,
    input.userId
  );
  const column = input.kind === 'voucher' ? 'voucher_id' : 'client_pack_id';
  await connection.execute(
    `INSERT INTO finance_benefit_logs(id,account_id,${column},appointment_id,action,performed_by_user_id,approved_by_user_id,performed_by_name,approved_by_name,notes,metadata) VALUES(UUID(),?,?,?,'adjusted',?,?,?,?,?,?)`,
    [
      input.accountId,
      input.sourceId,
      input.appointmentId,
      input.userId,
      input.userId,
      ownerName,
      ownerName,
      input.reason.trim(),
      JSON.stringify({
        action: 'expired_booking_authorized',
        appointment_id: input.appointmentId,
        previous_expiry: row.expires_at,
        scheduled_start: input.scheduledStart,
      }),
    ]
  );
}

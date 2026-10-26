import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import { requireBenefitOwner } from '@/lib/finance/benefit-administration';
import { accountDateInput, accountDateTimeToUtc } from '@/lib/timezone';
import type { RowDataPacket } from 'mysql2/promise';

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('owner');
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const day = typeof body?.expiresOn === 'string' ? body.expiresOn : '';
    const expiry = accountDateTimeToUtc(day, '23:59', 'Europe/Lisbon');
    if (
      !['voucher', 'pack'].includes(body?.kind) ||
      typeof body?.id !== 'string' ||
      reason.length < 5 ||
      reason.length > 500 ||
      !Number.isFinite(expiry.getTime()) ||
      accountDateInput(expiry, 'Europe/Lisbon') !== day
    )
      return Response.json(
        {
          error:
            'Indique o benefício, uma data válida e um motivo de 5 a 500 caracteres.',
        },
        { status: 400 }
      );
    expiry.setUTCSeconds(59, 999);
    const result = await transaction(async (connection) => {
      const ownerName = await requireBenefitOwner(
        connection,
        accountId,
        userId
      );
      const table =
        body.kind === 'voucher' ? 'finance_vouchers' : 'finance_client_packs';
      const column = body.kind === 'voucher' ? 'voucher_id' : 'client_pack_id';
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT expires_at,status FROM ${table} WHERE id=? AND account_id=? FOR UPDATE`,
        [body.id, accountId]
      );
      const previous = rows[0];
      if (!previous) return { error: 'Benefício não encontrado.', status: 404 };
      if (!['active', 'expired'].includes(previous.status))
        return {
          error:
            'Não é possível alterar a validade de um benefício cancelado, esgotado ou ainda por ativar.',
          status: 409,
        };
      await connection.execute(
        `UPDATE ${table} SET expires_at=?,status=? WHERE id=? AND account_id=?`,
        [
          expiry,
          expiry.getTime() > Date.now() ? 'active' : 'expired',
          body.id,
          accountId,
        ]
      );
      await connection.execute(
        `INSERT INTO finance_benefit_logs(id,account_id,${column},action,performed_by_user_id,approved_by_user_id,performed_by_name,approved_by_name,notes,metadata) VALUES(UUID(),?,?,'adjusted',?,?,?,?,?,?)`,
        [
          accountId,
          body.id,
          userId,
          userId,
          ownerName,
          ownerName,
          reason,
          JSON.stringify({
            action: 'validity_changed',
            previous_expiry: previous.expires_at,
            new_expiry: expiry.toISOString(),
          }),
        ]
      );
      return { expiresAt: expiry.toISOString() };
    });
    return Response.json(result, {
      status: 'status' in result ? result.status : 200,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

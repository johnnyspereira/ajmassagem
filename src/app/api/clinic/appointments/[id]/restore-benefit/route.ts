import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import { requireBenefitOwner } from '@/lib/finance/benefit-administration';
import type { RowDataPacket } from 'mysql2/promise';

class RestoreConflict extends Error {}

/** Reverses one redemption, never a purchase or a payment. All writes share the row locks. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('owner');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const benefitId = typeof body?.benefitId === 'string' ? body.benefitId : '';
    if (
      !/^[a-zA-Z0-9-]{1,64}$/.test(id) ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(benefitId) ||
      reason.length < 5 ||
      reason.length > 500
    )
      return Response.json(
        { error: 'Indique a utilização e um motivo de 5 a 500 caracteres.' },
        { status: 400 }
      );

    const result = await transaction(async (connection) => {
      const ownerName = await requireBenefitOwner(
        connection,
        accountId,
        userId
      );
      const [appointments] = await connection.execute<RowDataPacket[]>(
        'SELECT id,status,contact_id,paid_at FROM clinic_appointments WHERE id=? AND account_id=? FOR UPDATE',
        [id, accountId]
      );
      const appointment = appointments[0];
      if (!appointment || appointment.status !== 'cancelled')
        throw new RestoreConflict(
          'Guarde primeiro o cancelamento da marcação.'
        );
      const [benefits] = await connection.execute<RowDataPacket[]>(
        'SELECT * FROM finance_appointment_benefits WHERE id=? AND appointment_id=? AND account_id=? FOR UPDATE',
        [benefitId, id, accountId]
      );
      const benefit = benefits[0];
      if (!benefit || benefit.contact_id !== appointment.contact_id)
        throw new RestoreConflict(
          'Utilização não encontrada para este cliente e marcação.'
        );
      if (benefit.status === 'released')
        return {
          restored: false,
          alreadyRestored: true,
          benefitId,
          paidAt: appointment.paid_at ?? null,
        };
      if (benefit.status !== 'consumed')
        throw new RestoreConflict(
          'Esta ação aplica-se apenas a uma utilização já descontada.'
        );
      if (!['voucher', 'pack'].includes(benefit.benefit_type))
        throw new RestoreConflict('Tipo de benefício inválido.');

      const isVoucher = benefit.benefit_type === 'voucher';
      const sourceId = isVoucher ? benefit.voucher_id : benefit.client_pack_id;
      const table = isVoucher ? 'finance_vouchers' : 'finance_client_packs';
      const [sources] = await connection.execute<RowDataPacket[]>(
        `SELECT * FROM ${table} WHERE id=? AND account_id=? FOR UPDATE`,
        [sourceId, accountId]
      );
      const source = sources[0];
      const holder = isVoucher ? source?.owner_contact_id : source?.contact_id;
      if (holder && holder !== appointment.contact_id)
        throw new RestoreConflict(
          'O benefício já não pertence ao cliente desta marcação. Reveja a titularidade antes de devolver.'
        );
      if (
        !source ||
        !['active', 'used', 'consumed', 'expired'].includes(source.status)
      )
        throw new RestoreConflict(
          'O benefício está cancelado, por ativar ou indisponível para devolução.'
        );
      const sourceSaleId = isVoucher ? source.issued_sale_id : source.sale_id;
      if (sourceSaleId) {
        const [sales] = await connection.execute<RowDataPacket[]>(
          'SELECT status FROM finance_sales WHERE id=? AND account_id=? FOR UPDATE',
          [sourceSaleId, accountId]
        );
        if (!sales[0] || ['voided', 'refunded'].includes(sales[0].status))
          throw new RestoreConflict(
            'A compra foi anulada ou reembolsada; não é possível reativar este benefício.'
          );
      }
      const expired =
        source.status === 'expired' ||
        (source.expires_at &&
          new Date(source.expires_at).getTime() <= Date.now());
      const status = expired ? 'expired' : 'active';
      let amount = 0,
        sessions = 0;
      let previous: Record<string, unknown>, next: Record<string, unknown>;
      if (isVoucher && source.voucher_type === 'service') {
        const uses = Number(source.remaining_uses);
        if (!Number.isInteger(uses) || uses < 0)
          throw new RestoreConflict(
            'O saldo de utilizações do voucher precisa de revisão.'
          );
        sessions = 1;
        const balance =
          uses === 0
            ? Number(source.initial_balance)
            : Number(source.current_balance);
        previous = {
          remaining_uses: uses,
          current_balance: source.current_balance,
          status: source.status,
        };
        next = { remaining_uses: uses + 1, current_balance: balance, status };
        await connection.execute(
          'UPDATE finance_vouchers SET remaining_uses=?,current_balance=?,status=? WHERE id=? AND account_id=?',
          [uses + 1, balance, status, sourceId, accountId]
        );
      } else if (isVoucher) {
        amount = Number(benefit.reserved_amount);
        const balance =
          Math.round((Number(source.current_balance) + amount) * 100) / 100;
        if (
          !(amount > 0) ||
          !Number.isFinite(balance) ||
          balance > Number(source.initial_balance) + 0.001
        )
          throw new RestoreConflict(
            'O valor consumido não é compatível com o saldo do voucher.'
          );
        previous = {
          current_balance: source.current_balance,
          status: source.status,
        };
        next = { current_balance: balance, status };
        await connection.execute(
          'UPDATE finance_vouchers SET current_balance=?,status=? WHERE id=? AND account_id=?',
          [balance, status, sourceId, accountId]
        );
      } else {
        sessions = Number(benefit.reserved_sessions);
        const [balances] = await connection.execute<RowDataPacket[]>(
          'SELECT * FROM finance_client_pack_balances WHERE id=? AND client_pack_id=? FOR UPDATE',
          [benefit.client_pack_balance_id, sourceId]
        );
        const balance = balances[0];
        if (
          !balance ||
          !Number.isInteger(sessions) ||
          sessions < 1 ||
          Number(balance.used_sessions) < sessions ||
          Number(balance.remaining_sessions) + sessions >
            Number(balance.total_sessions)
        )
          throw new RestoreConflict(
            'O saldo da modalidade do pack não permite esta devolução.'
          );
        previous = {
          used_sessions: balance.used_sessions,
          remaining_sessions: balance.remaining_sessions,
          status: source.status,
        };
        next = {
          used_sessions: Number(balance.used_sessions) - sessions,
          remaining_sessions: Number(balance.remaining_sessions) + sessions,
          status,
        };
        await connection.execute(
          'UPDATE finance_client_pack_balances SET used_sessions=used_sessions-?,remaining_sessions=remaining_sessions+? WHERE id=? AND client_pack_id=?',
          [sessions, sessions, benefit.client_pack_balance_id, sourceId]
        );
        await connection.execute(
          'UPDATE finance_client_packs SET status=? WHERE id=? AND account_id=?',
          [status, sourceId, accountId]
        );
      }
      await connection.execute(
        "UPDATE finance_appointment_benefits SET status='released',released_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=? AND status='consumed'",
        [benefitId, accountId]
      );
      await connection.execute(
        `UPDATE clinic_appointments SET paid_at=NULL WHERE id=? AND account_id=?
        AND NOT EXISTS(SELECT 1 FROM finance_appointment_benefits WHERE appointment_id=? AND status='consumed')
        AND NOT EXISTS(SELECT 1 FROM finance_sales WHERE appointment_id=? AND account_id=? AND paid_amount>0 AND status NOT IN('voided','refunded'))`,
        [id, accountId, id, id, accountId]
      );
      const column = isVoucher ? 'voucher_id' : 'client_pack_id';
      await connection.execute(
        `INSERT INTO finance_benefit_logs(id,account_id,${column},appointment_id,action,amount,sessions,performed_by_user_id,approved_by_user_id,performed_by_name,approved_by_name,notes,metadata) VALUES(UUID(),?,?,?,'adjusted',?,?,?,?,?,?,?,?)`,
        [
          accountId,
          sourceId,
          id,
          amount,
          sessions,
          userId,
          userId,
          ownerName,
          ownerName,
          reason,
          JSON.stringify({
            action: 'consumed_benefit_restored',
            benefit_id: benefitId,
            previous,
            next,
          }),
        ]
      );
      await connection.execute(
        `INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,metadata) VALUES(UUID(),?,?,'appointment',?,'updated',?,?)`,
        [
          accountId,
          userId,
          id,
          reason,
          JSON.stringify({
            action: 'benefit_restored',
            benefit_id: benefitId,
            benefit_type: benefit.benefit_type,
            source_id: sourceId,
            amount,
            sessions,
          }),
        ]
      );
      const [updated] = await connection.execute<RowDataPacket[]>(
        'SELECT paid_at FROM clinic_appointments WHERE id=? AND account_id=?',
        [id, accountId]
      );
      return {
        restored: true,
        alreadyRestored: false,
        benefitId,
        status,
        sessions,
        amount,
        paidAt: updated[0]?.paid_at ?? null,
      };
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof RestoreConflict)
      return Response.json({ error: error.message }, { status: 409 });
    return toErrorResponse(error);
  }
}

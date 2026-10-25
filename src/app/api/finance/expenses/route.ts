import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { selectRows, transaction } from '@/lib/mysql/db';
import { accountDateInput } from '@/lib/timezone';

export async function GET() {
  try {
    const { accountId } = await requireRole('agent');
    return Response.json(
      {
        accounts: await selectRows<RowDataPacket[]>(
          'SELECT id,name,account_type,currency FROM finance_fund_accounts WHERE account_id=? AND is_active=TRUE ORDER BY name',
          [accountId]
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const body = await request.json().catch(() => null);
    const amount = Number(body?.amount),
      description =
        typeof body?.description === 'string' ? body.description.trim() : '';
    const occurred = new Date(body?.occurredAt || Date.now());
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 100) < 1 ||
      amount > 999999999 ||
      !description ||
      description.length > 500 ||
      !Number.isFinite(occurred.getTime()) ||
      occurred.getTime() > Date.now() + 60000
    )
      return Response.json(
        {
          error:
            'Preencha um valor positivo, a descrição e uma data válida, sem ser futura.',
        },
        { status: 400 }
      );
    const fundId =
      typeof body.fundAccountId === 'string' ? body.fundAccountId : '';
    const method =
      typeof body.paymentMethod === 'string'
        ? body.paymentMethod
        : 'bank_transfer';
    if (
      !['bank_transfer', 'card', 'mb_way', 'multibanco', 'other'].includes(
        method
      )
    )
      return Response.json(
        { error: 'Escolha um método de pagamento válido.' },
        { status: 400 }
      );
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    if (requestId && !/^[a-f0-9-]{36}$/i.test(requestId))
      return Response.json(
        { error: 'Pedido de saída inválido.' },
        { status: 400 }
      );
    const funds = fundId
      ? await selectRows<RowDataPacket[]>(
          'SELECT id,account_type FROM finance_fund_accounts WHERE id=? AND account_id=? AND is_active=TRUE',
          [fundId, accountId]
        )
      : [];
    if (fundId && !funds.length)
      return Response.json(
        { error: 'Conta financeira indisponível.' },
        { status: 409 }
      );
    const result = await transaction(async (connection) => {
      const [account] = await connection.execute<RowDataPacket[]>(
        'SELECT id,default_currency FROM accounts WHERE id=? FOR UPDATE',
        [accountId]
      );
      if (requestId) {
        const [existing] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM finance_payables WHERE id=? AND account_id=? FOR UPDATE',
          [requestId, accountId]
        );
        if (existing.length) return { id: requestId, recordedIn: 'existing' };
      }
      const [cash] = await connection.execute<RowDataPacket[]>(
        "SELECT id,opened_at FROM finance_cash_sessions WHERE account_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE",
        [accountId]
      );
      const isCash = !fundId || funds[0]?.account_type === 'cash';
      if (
        cash.length &&
        isCash &&
        occurred.getTime() >= new Date(cash[0].opened_at).getTime()
      ) {
        const movementId = randomUUID();
        const payableId = requestId || randomUUID();
        await connection.execute(
          "INSERT INTO finance_cash_movements(id,account_id,cash_session_id,movement_type,amount,description,payment_method,created_by_user_id,created_at) VALUES(?,?,?,'expense',?,?,'cash',?,?)",
          [
            movementId,
            accountId,
            cash[0].id,
            Math.round(amount * 100) / 100,
            description,
            userId,
            occurred,
          ]
        );
        await connection.execute(
          "INSERT INTO finance_payables(id,account_id,description,amount,currency,due_date,status,paid_at,payment_method,cash_movement_id,created_by_user_id) VALUES(?,?,?,?,?,?,'paid',?,'cash',?,?)",
          [
            payableId,
            accountId,
            description,
            Math.round(amount * 100) / 100,
            account[0].default_currency,
            accountDateInput(occurred, 'Europe/Lisbon'),
            occurred,
            movementId,
            userId,
          ]
        );
        return { id: payableId, recordedIn: 'cash' };
      }
      let selected = fundId;
      if (!selected) {
        const [existing] = await connection.execute<RowDataPacket[]>(
          "SELECT id FROM finance_fund_accounts WHERE account_id=? AND account_type='cash' AND is_active=TRUE ORDER BY created_at LIMIT 1 FOR UPDATE",
          [accountId]
        );
        selected = existing[0]?.id || randomUUID();
        if (!existing.length)
          await connection.execute(
            "INSERT INTO finance_fund_accounts(id,account_id,name,account_type,currency,created_by_user_id) SELECT ?,id,'Dinheiro físico','cash',default_currency,? FROM accounts WHERE id=?",
            [selected, userId, accountId]
          );
      } else {
        const [owned] = await connection.execute<RowDataPacket[]>(
          'SELECT id FROM finance_fund_accounts WHERE id=? AND account_id=? AND is_active=TRUE FOR UPDATE',
          [selected, accountId]
        );
        if (!owned.length) throw new Error('Expense account changed.');
      }
      const [currency] = await connection.execute<RowDataPacket[]>(
        'SELECT currency FROM finance_fund_accounts WHERE id=? AND account_id=?',
        [selected, accountId]
      );
      const id = randomUUID(),
        payableId = requestId || randomUUID();
      await connection.execute(
        "INSERT INTO finance_fund_transactions(id,account_id,fund_account_id,direction,transaction_type,amount,description,reference,created_by_user_id,created_at) VALUES(?,?,?,'debit','payable_payment',?,?,?,?,?)",
        [
          id,
          accountId,
          selected,
          Math.round(amount * 100) / 100,
          description,
          payableId,
          userId,
          occurred,
        ]
      );
      await connection.execute(
        "INSERT INTO finance_payables(id,account_id,description,amount,currency,due_date,status,paid_at,payment_method,notes,created_by_user_id) VALUES(?,?,?,?,?,?,'paid',?,?,?,?)",
        [
          payableId,
          accountId,
          description,
          Math.round(amount * 100) / 100,
          currency[0].currency,
          accountDateInput(occurred, 'Europe/Lisbon'),
          occurred,
          isCash ? 'cash' : method,
          `Saída registada na conta financeira · movimento ${id}`,
          userId,
        ]
      );
      return { id: payableId, recordedIn: 'fund' };
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}

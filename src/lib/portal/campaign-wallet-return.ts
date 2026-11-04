import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** Called inside the ordinary sale reversal transaction, after locking the sale. */
export async function returnCampaignWalletCredit(
  connection: PoolConnection,
  accountId: string,
  saleId: string,
  userId: string
) {
  const [orders] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM portal_campaign_enrollments WHERE sale_id=? AND account_id=? LIMIT 1',
    [saleId, accountId]
  );
  if (!orders.length) return;
  const [debits] = await connection.execute<RowDataPacket[]>(
    `SELECT t.wallet_id,t.amount,t.id FROM finance_wallet_transactions t
     JOIN finance_payments p ON p.id=t.payment_id AND p.account_id=t.account_id
     WHERE p.sale_id=? AND p.account_id=? AND p.status='confirmed' AND p.method='client_credit' AND t.transaction_type='debit' FOR UPDATE`,
    [saleId, accountId]
  );
  for (const debit of debits) {
    const amount = -Number(debit.amount);
    if (!(amount > 0)) continue;
    const [wallets] = await connection.execute<RowDataPacket[]>(
      'SELECT balance FROM finance_client_wallets WHERE id=? AND account_id=? FOR UPDATE',
      [debit.wallet_id, accountId]
    );
    if (!wallets[0]) throw new Error('Cartão-saldo da compra não encontrado.');
    const balance =
      Math.round((Number(wallets[0].balance) + amount) * 100) / 100;
    await connection.execute(
      'UPDATE finance_client_wallets SET balance=? WHERE id=? AND account_id=?',
      [balance, debit.wallet_id, accountId]
    );
    await connection.execute(
      `INSERT INTO finance_wallet_transactions
      (id,account_id,wallet_id,transaction_type,amount,balance_after,sale_id,performed_by_user_id,description,metadata)
      VALUES(?,?,?,'credit',?,?,?,?,?,?)`,
      [
        randomUUID(),
        accountId,
        debit.wallet_id,
        amount,
        balance,
        saleId,
        userId,
        'Devolução de saldo: compra de campanha anulada ou reembolsada',
        JSON.stringify({ reversed_wallet_transaction_id: debit.id }),
      ]
    );
  }
  await connection.execute(
    "UPDATE portal_campaign_enrollments SET status='cancelled' WHERE sale_id=? AND account_id=?",
    [saleId, accountId]
  );
}

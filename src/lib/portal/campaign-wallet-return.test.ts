import { expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { returnCampaignWalletCredit } from './campaign-wallet-return';
it('returns only the confirmed wallet debit on a campaign sale, leaving money payments to normal reversal', async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([[{ id: 'order' }]])
    .mockResolvedValueOnce([
      [{ id: 'debit', wallet_id: 'wallet', amount: -20 }],
    ])
    .mockResolvedValueOnce([[{ balance: 5 }]])
    .mockResolvedValue([{}]);
  await returnCampaignWalletCredit(
    { execute } as unknown as PoolConnection,
    'own',
    'sale',
    'owner'
  );
  const update = execute.mock.calls.find(([sql]) =>
    sql.startsWith('UPDATE finance_client_wallets')
  )!;
  expect(update[1]).toEqual([25, 'wallet', 'own']);
  expect(execute.mock.calls[1][0]).toContain("p.status='confirmed'");
  expect(execute.mock.calls[1][0]).toContain("p.method='client_credit'");
  expect(execute.mock.calls[1][0]).toContain('FOR UPDATE');
  const credit = execute.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO finance_wallet_transactions')
  )!;
  expect(credit[1]).toContain(20);
  expect(credit[1]).toContain(
    JSON.stringify({ reversed_wallet_transaction_id: 'debit' })
  );
  expect(execute.mock.calls.at(-1)?.[0]).toContain("status='cancelled'");
});
it('does not alter ordinary sales or already reversed wallet payments', async () => {
  const execute = vi.fn().mockResolvedValueOnce([[]]);
  await returnCampaignWalletCredit(
    { execute } as unknown as PoolConnection,
    'own',
    'ordinary',
    'owner'
  );
  expect(execute).toHaveBeenCalledOnce();
  execute
    .mockReset()
    .mockResolvedValueOnce([[{ id: 'order' }]])
    .mockResolvedValueOnce([[]])
    .mockResolvedValue([{}]);
  await returnCampaignWalletCredit(
    { execute } as unknown as PoolConnection,
    'own',
    'reversed',
    'owner'
  );
  expect(
    execute.mock.calls.some(([sql]) =>
      sql.startsWith('UPDATE finance_client_wallets')
    )
  ).toBe(false);
});

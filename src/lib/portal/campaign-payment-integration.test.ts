import { expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
vi.mock('@/lib/mysql/db', () => ({
  selectRows: vi.fn(),
  mutate: vi.fn(),
  transaction: vi.fn(),
}));
import { addPayment } from '@/lib/mysql/rpc';
it('activates the actual benefit and marks enrollment converted only when the remaining payment settles the sale', async () => {
  const execute = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT balance_due,paid_amount'))
      return [
        [
          {
            balance_due: 39,
            paid_amount: 20,
            total_amount: 59,
            appointment_id: null,
            contact_id: 'client',
            status: 'partially_paid',
          },
        ],
      ];
    if (
      sql.includes('information_schema.columns') ||
      sql.includes('information_schema.COLUMNS')
    )
      return [
        [
          { COLUMN_NAME: 'paid_amount' },
          { COLUMN_NAME: 'issued_sale_item_id' },
        ],
      ];
    return [{ affectedRows: 1 }];
  });
  await addPayment({ execute } as unknown as PoolConnection, {
    accountId: 'own',
    userId: 'owner',
    saleId: 'sale',
    method: 'mb_way',
    amount: 39,
    cashSessionId: null,
    reference: 'proof',
    pin: null,
    notes: 'MB WAY confirmado pela equipa',
  });
  const sale = execute.mock.calls.find(([sql]) =>
    sql.startsWith('UPDATE finance_sales SET paid_amount')
  )!;
  expect(sale[1].slice(0, 4)).toEqual([59, 59, 'paid', true]);
  expect(
    execute.mock.calls.some(([sql]) =>
      sql.includes("UPDATE finance_vouchers SET status='active'")
    )
  ).toBe(true);
  expect(
    execute.mock.calls.some(([sql]) =>
      sql.includes("UPDATE finance_client_packs SET status='active'")
    )
  ).toBe(true);
  expect(
    execute.mock.calls.some(([sql]) =>
      sql.includes("UPDATE portal_campaign_enrollments SET status='converted'")
    )
  ).toBe(true);
});
it('does not activate benefits for an incomplete payment', async () => {
  const execute = vi.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT balance_due,paid_amount'))
      return [
        [
          {
            balance_due: 39,
            paid_amount: 20,
            total_amount: 59,
            appointment_id: null,
            contact_id: 'client',
            status: 'partially_paid',
          },
        ],
      ];
    if (sql.includes('information_schema'))
      return [
        [
          { COLUMN_NAME: 'paid_amount' },
          { COLUMN_NAME: 'issued_sale_item_id' },
        ],
      ];
    return [{ affectedRows: 1 }];
  });
  await addPayment({ execute } as unknown as PoolConnection, {
    accountId: 'own',
    userId: 'owner',
    saleId: 'sale',
    method: 'mb_way',
    amount: 10,
    cashSessionId: null,
    reference: null,
    pin: null,
    notes: null,
  });
  expect(
    execute.mock.calls.some(([sql]) => sql.includes("SET status='active'"))
  ).toBe(false);
  expect(
    execute.mock.calls.some(([sql]) => sql.includes("SET status='converted'"))
  ).toBe(false);
});

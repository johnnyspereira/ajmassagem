import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: vi.fn(),
  pay: vi.fn(),
  execute: vi.fn(),
  schema: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.tx }));
vi.mock('@/lib/mysql/rpc', () => ({ addPayment: mocks.pay }));
vi.mock('./store-schema', () => ({ ensurePortalStoreSchema: mocks.schema }));
vi.mock('./server', () => ({
  PortalError: class extends Error {
    constructor(
      message: string,
      readonly status = 400
    ) {
      super(message);
    }
  },
}));
import { purchaseCampaign } from './campaign-purchase';
let campaign: Record<string, unknown>,
  balance: number,
  previous: Record<string, unknown>[],
  catalog: Record<string, unknown>[],
  capacity: number;
beforeEach(() => {
  vi.resetAllMocks();
  campaign = {
    id: 'campaign',
    status: 'published',
    starts_at: '2020-01-01',
    ends_at: null,
    commerce_enabled: 1,
    commerce_price: 59,
    commerce_currency: 'EUR',
    commerce_item_type: 'voucher',
    commerce_source_id: 'service',
    commerce_validity_days: 365,
    campaign_kind: 'exchange',
    title: 'Experiência',
  };
  balance = 20;
  previous = [];
  catalog = [{ id: 'service', name: 'Modalidade', price: 89 }];
  capacity = 0;
  mocks.tx.mockImplementation((work) => work({ execute: mocks.execute }));
  mocks.pay.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM portal_campaigns')) return [[campaign]];
    if (sql.includes('FROM portal_campaign_enrollments e JOIN finance_sales'))
      return [previous];
    if (sql.startsWith('SELECT balance FROM finance_client_wallets'))
      return [[{ balance }]];
    if (
      sql.startsWith('SELECT COUNT(*) total FROM portal_campaign_enrollments')
    )
      return [[{ total: capacity }]];
    if (sql.startsWith('SELECT owner_user_id'))
      return [[{ owner_user_id: 'owner' }]];
    if (
      sql.includes('FROM clinic_services WHERE id=') ||
      sql.includes('FROM finance_pack_catalog WHERE id=')
    )
      return [catalog];
    if (sql.includes('FROM finance_pack_items i JOIN'))
      return [[{ service_id: 'service', sessions: 3 }]];
    if (sql.startsWith('SELECT COUNT(*) total FROM finance_pack_items'))
      return [[{ total: 1 }]];
    if (sql.startsWith('SELECT id,status,balance_due'))
      return [
        [
          {
            id: 'sale',
            status: balance >= 59 ? 'paid' : 'partially_paid',
            balance_due: Math.max(59 - balance, 0),
            paid_amount: Math.min(balance, 59),
            sale_number: 1,
          },
        ],
      ];
    return [{ affectedRows: 1 }];
  });
});
it('creates one pending voucher and applies exactly the available credit through the shared payment path', async () => {
  const sale = await purchaseCampaign('own', 'client', 'campaign');
  expect(sale.balance_due).toBe(39);
  expect(mocks.pay).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.objectContaining({
      accountId: 'own',
      saleId: expect.any(String),
      method: 'client_credit',
      amount: 20,
      cashSessionId: null,
    })
  );
  const voucher = mocks.execute.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO finance_vouchers')
  )!;
  expect(voucher[0]).toContain("'pending'");
  expect(voucher[1]).toContain('client');
  expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(mocks.execute.mock.calls[0][1]).toEqual(['campaign', 'own']);
});
it('reuses a pending order without creating a sale, voucher or second debit', async () => {
  previous = [
    {
      id: 'existing',
      status: 'partially_paid',
      balance_due: 39,
      paid_amount: 20,
    },
  ];
  const sale = await purchaseCampaign('own', 'client', 'campaign');
  expect(sale).toMatchObject({ id: 'existing', reused: true });
  expect(mocks.pay).not.toHaveBeenCalled();
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))
  ).toBe(false);
});
it('fully settles with credit without overcharging a larger wallet', async () => {
  balance = 100;
  expect((await purchaseCampaign('own', 'client', 'campaign')).status).toBe(
    'paid'
  );
  expect(mocks.pay.mock.calls[0][1].amount).toBe(59);
});
it('refuses promotional campaigns for a client with balance before any financial write', async () => {
  campaign.campaign_kind = 'promotional';
  await expect(purchaseCampaign('own', 'client', 'campaign')).rejects.toThrow(
    'promocionais'
  );
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))
  ).toBe(false);
});
it('refuses an unavailable or foreign catalog source and exhausted capacity', async () => {
  catalog = [];
  await expect(purchaseCampaign('own', 'client', 'campaign')).rejects.toThrow(
    'indisponível'
  );
  campaign.capacity = 1;
  capacity = 1;
  await expect(purchaseCampaign('own', 'client', 'campaign')).rejects.toThrow(
    'esgotada'
  );
  expect(mocks.pay).not.toHaveBeenCalled();
});
it('creates a pending pack with all catalog balances instead of a generic service line', async () => {
  campaign.commerce_item_type = 'pack';
  catalog = [{ id: 'pack', validity_days: 90 }];
  await purchaseCampaign('own', 'client', 'campaign');
  expect(
    mocks.execute.mock.calls.some(
      ([sql]) =>
        sql.includes('INSERT INTO finance_client_packs') &&
        sql.includes("'pending'")
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO finance_client_pack_balances')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO finance_vouchers')
    )
  ).toBe(false);
});
it('propagates failure to the transaction when wallet debit cannot be registered', async () => {
  mocks.pay.mockRejectedValueOnce(new Error('Saldo insuficiente'));
  await expect(purchaseCampaign('own', 'client', 'campaign')).rejects.toThrow(
    'Saldo insuficiente'
  );
});
it('requires review again if the balance or price changed after the customer saw the quote', async () => {
  await expect(
    purchaseCampaign('own', 'client', 'campaign', {
      total: 59,
      wallet: 10,
      due: 49,
    })
  ).rejects.toThrow('mudou');
  expect(mocks.pay).not.toHaveBeenCalled();
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))
  ).toBe(false);
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  tx: vi.fn(),
  execute: vi.fn(),
  request: vi.fn(),
  credentials: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.tx }));
vi.mock('@/lib/finance/sumup', () => ({
  sumUpRequest: mocks.request,
  getSumUpCredentials: mocks.credentials,
}));
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
import { campaignCheckout } from './campaign-checkout';
let saved: {
    id: string;
    amount: number;
    payment_url?: string;
    status?: string;
  }[],
  method: string | null;
beforeEach(() => {
  vi.resetAllMocks();
  saved = [];
  method = null;
  mocks.credentials.mockReturnValue({ merchantCode: 'TEST' });
  mocks.tx.mockImplementation((work) => work({ execute: mocks.execute }));
  mocks.execute.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith('SELECT id,status,balance_due'))
      return [
        [
          {
            id: 'sale',
            status: 'partially_paid',
            balance_due: 39,
            currency: 'EUR',
          },
        ],
      ];
    if (sql.startsWith('SELECT payment_method'))
      return [[{ payment_method: method }]];
    if (sql.startsWith('SELECT id,amount,status')) return [saved];
    if (sql.startsWith('INSERT INTO finance_payment_links'))
      saved = [{ id: args[0] as string, amount: 39, status: 'pending' }];
    if (sql.startsWith('SELECT * FROM finance_payment_links')) return [saved];
    if (sql.startsWith('UPDATE portal_campaign_enrollments'))
      method = args[0] as string;
    return [{ affectedRows: 1 }];
  });
});
const run = (method: 'card' | 'mbway') =>
  campaignCheckout(
    'own',
    'client',
    'sale',
    'portal',
    'https://crm.test',
    method
  );
it('returns MB WAY instructions for the exact remainder without registering a received payment', async () => {
  expect(await run('mbway')).toMatchObject({
    mbwayPhone: '935864343',
    due: 39,
  });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO finance_payments')
    )
  ).toBe(false);
});
it('does not allow switching methods and risking a duplicate payment', async () => {
  method = 'card';
  await expect(run('mbway')).rejects.toThrow('método');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('reuses an existing hosted link instead of creating another checkout', async () => {
  saved = [
    {
      id: 'link',
      amount: 39,
      payment_url: 'https://checkout.sumup.com/test',
      status: 'pending',
    },
  ];
  expect(await run('card')).toEqual({
    checkoutUrl: 'https://checkout.sumup.com/test',
  });
  expect(mocks.request).not.toHaveBeenCalled();
});
it('recovers a checkout by stable reference after an uncertain prior request', async () => {
  saved = [{ id: 'stable', amount: 39, status: 'pending' }];
  mocks.request.mockResolvedValueOnce(
    Response.json([
      {
        id: 'external',
        checkout_reference: 'stable',
        hosted_checkout_url: 'https://checkout.sumup.com/test',
        status: 'PENDING',
      },
    ])
  );
  expect(await run('card')).toEqual({
    checkoutUrl: 'https://checkout.sumup.com/test',
  });
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.request.mock.calls[0][0]).toContain('checkout_reference=stable');
});
it('charges only the remainder and keeps the local reference after a provider timeout', async () => {
  mocks.request
    .mockResolvedValueOnce(Response.json([]))
    .mockRejectedValueOnce(new Error('Timeout'));
  await expect(run('card')).rejects.toThrow('Timeout');
  const posted = JSON.parse(mocks.request.mock.calls[1][1].body);
  expect(posted.amount).toBe(39);
  expect(posted.checkout_reference).toBe(saved[0].id);
  expect(saved).toHaveLength(1);
});

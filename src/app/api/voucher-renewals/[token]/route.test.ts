import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn(),
  sumup: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  transaction: mocks.transaction,
}));
vi.mock('@/lib/clinic/voucher-renewal', () => ({
  ensureRenewalSchema: vi.fn(),
  prepareRenewalSale: mocks.prepare,
  RenewalError: class extends Error {},
}));
vi.mock('@/lib/finance/sumup', () => ({
  getSumUpCredentials: () => ({ merchantCode: 'test' }),
  sumUpRequest: mocks.sumup,
}));
import { GET, POST } from './route';
const params = { params: Promise.resolve({ token: 'a'.repeat(64) }) };
const offer = {
  id: 'offer-id',
  account_id: 'account',
  sale_id: 'sale',
  contact_id: 'client',
  amount: 30,
  currency: 'EUR',
  mbway_phone: '912345678',
  service: 'Relaxamento',
  created_by_user_id: 'sender',
  sent_at: new Date(),
  expires_at: new Date(Date.now() + 3600000),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue(offer);
  mocks.select.mockResolvedValue([{ status: 'open' }]);
});
it('opening the offer never creates a sale or checkout and escapes the service name', async () => {
  mocks.select.mockResolvedValue([{ ...offer, name: '<script>bad</script>' }]);
  const response = await GET(new Request('https://example.test/offer'), params);
  const html = await response.text();
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Transferir por MB WAY');
  expect(html).toContain('Pagar com cartão');
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.sumup).not.toHaveBeenCalled();
});
it('MB WAY shows the configured phone and reference, never calls the card provider or marks paid', async () => {
  const response = await POST(
    new Request('https://example.test/offer', {
      method: 'POST',
      body: new URLSearchParams({ method: 'mbway' }),
    }),
    params
  );
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain('912345678');
  expect(html).toContain('30,00');
  expect(html).toContain('aguardar pagamento');
  expect(mocks.sumup).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('does not request another payment for an already paid MB WAY purchase', async () => {
  mocks.select.mockResolvedValue([{ status: 'paid' }]);
  const response = await POST(
    new Request('https://example.test/offer', {
      method: 'POST',
      body: new URLSearchParams({ method: 'mbway' }),
    }),
    params
  );
  expect(await response.text()).toContain('Pagamento já confirmado');
  expect(mocks.sumup).not.toHaveBeenCalled();
});
it('rejects expired offers before creating a checkout', async () => {
  mocks.prepare.mockRejectedValue(new Error('expired'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await POST(
    new Request('https://example.test/offer', {
      method: 'POST',
      body: new URLSearchParams({ method: 'card' }),
    }),
    params
  );
  expect(response.status).toBe(409);
  expect(mocks.sumup).not.toHaveBeenCalled();
  log.mockRestore();
});
it('reuses an existing card checkout under the offer lock without issuing a second one', async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([[{ payment_link_id: 'link' }]])
    .mockResolvedValueOnce([[{ status: 'open', balance_due: 30 }]])
    .mockResolvedValueOnce([
      [
        {
          status: 'pending',
          payment_url: 'https://checkout.sumup.com/pay/test',
          created_at: new Date(),
        },
      ],
    ]);
  mocks.transaction.mockImplementation(async (work) => work({ execute }));
  const response = await POST(
    new Request('https://example.test/offer', {
      method: 'POST',
      body: new URLSearchParams({ method: 'card' }),
    }),
    params
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(
    'https://checkout.sumup.com/pay/test'
  );
  expect(mocks.sumup).not.toHaveBeenCalled();
  expect(execute.mock.calls[0][0]).toContain('FOR UPDATE');
});
it('creates a card payment link with the offer amount and operator for automatic payment confirmation', async () => {
  const execute = vi
    .fn()
    .mockImplementation(async (sql: string, values: unknown[]) => {
      expect((sql.match(/\?/g) || []).length).toBe(values.length);
      if (sql.includes('SELECT payment_link_id'))
        return [[{ payment_link_id: null }]];
      if (sql.includes('SELECT status,balance_due'))
        return [[{ status: 'open', balance_due: 30 }]];
      return [{ affectedRows: 1 }];
    });
  mocks.transaction.mockImplementation(async (work) => work({ execute }));
  mocks.sumup.mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'checkout',
        hosted_checkout_url: 'https://checkout.sumup.com/pay/test',
      }),
      { status: 200 }
    )
  );
  const response = await POST(
    new Request('https://example.test/offer', {
      method: 'POST',
      body: new URLSearchParams({ method: 'card' }),
    }),
    params
  );
  expect(response.status).toBe(303);
  const link = execute.mock.calls.find((call) =>
    call[0].includes('INSERT INTO finance_payment_links')
  );
  expect(link?.[1]).toContain('sender');
  expect(link?.[1]).toContain(30);
  expect(JSON.parse(mocks.sumup.mock.calls[0][1].body).amount).toBe(30);
});

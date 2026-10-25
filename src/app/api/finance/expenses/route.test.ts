import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  cash: false,
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Failed' }, { status: 500 }),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  transaction: mocks.transaction,
}));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('https://crm.test/api/finance/expenses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cash = false;
  mocks.role.mockResolvedValue({ accountId: 'account', userId: 'operator' });
  mocks.select.mockResolvedValue([{ id: 'bank', account_type: 'bank' }]);
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.startsWith('SELECT id,default_currency'))
      return [[{ id: 'account', default_currency: 'EUR' }]];
    if (sql.includes('FROM finance_cash_sessions'))
      return [mocks.cash ? [{ id: 'cash', opened_at: '2020-01-01' }] : []];
    if (sql.startsWith('SELECT currency')) return [[{ currency: 'EUR' }]];
    if (sql.startsWith('SELECT')) return [[{ id: 'fund' }]];
    return [{ affectedRows: 1 }];
  });
  mocks.transaction.mockImplementation(async (work) =>
    work({ execute: mocks.execute })
  );
});
it('rejects invalid amounts, future dates and empty descriptions without writing', async () => {
  for (const body of [
    { amount: 0, description: 'Expense' },
    { amount: -1, description: 'Expense' },
    { amount: 10, description: '' },
    { amount: 10, description: 'Expense', occurredAt: '2099-01-01' },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('records a bank debit and a paid treasury entry atomically without touching cash', async () => {
  const response = await POST(
    request({ amount: 12.5, description: 'Material', fundAccountId: 'bank' })
  );
  expect(response.status).toBe(200);
  expect((await response.json()).recordedIn).toBe('fund');
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_fund_transactions')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_payables')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_cash_movements')
    )
  ).toBe(false);
});
it('records physical cash once in the open drawer with a linked paid treasury entry', async () => {
  mocks.cash = true;
  const response = await POST(request({ amount: 10, description: 'Limpeza' }));
  expect((await response.json()).recordedIn).toBe('cash');
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_cash_movements')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_fund_transactions')
    )
  ).toBe(false);
});
it('allows a physical cash expense without opening a drawer and blocks another account fund', async () => {
  expect(
    (await POST(request({ amount: 10, description: 'Limpeza' }))).status
  ).toBe(200);
  mocks.select.mockResolvedValue([]);
  expect(
    (
      await POST(
        request({
          amount: 10,
          description: 'Limpeza',
          fundAccountId: 'foreign',
        })
      )
    ).status
  ).toBe(409);
});
it('reuses an existing request identifier without another debit', async () => {
  const original = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) =>
    sql.includes('FROM finance_payables')
      ? [[{ id: '12345678-1234-4234-8234-123456789abc' }]]
      : original(sql, values)
  );
  const response = await POST(
    request({
      requestId: '12345678-1234-4234-8234-123456789abc',
      amount: 10,
      description: 'Limpeza',
    })
  );
  expect((await response.json()).recordedIn).toBe('existing');
  expect(
    mocks.execute.mock.calls.some((call) => call[0].startsWith('INSERT'))
  ).toBe(false);
});
it('does not put a retroactive expense into the current open cash drawer', async () => {
  mocks.cash = true;
  const original = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) =>
    sql.includes('FROM finance_cash_sessions')
      ? [[{ id: 'cash', opened_at: new Date() }]]
      : original(sql, values)
  );
  const response = await POST(
    request({
      amount: 10,
      description: 'Limpeza',
      occurredAt: '2026-01-01T12:00:00Z',
    })
  );
  expect((await response.json()).recordedIn).toBe('fund');
  expect(
    mocks.execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_cash_movements')
    )
  ).toBe(false);
});

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Falha' }, { status: 500 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
import { POST } from './route';

let appointment: Record<string, unknown>,
  benefit: Record<string, unknown>,
  source: Record<string, unknown>,
  balance: Record<string, unknown>,
  saleStatus: string;
const call = (
  body = { benefitId: 'benefit', reason: 'Cancelamento autorizado' }
) =>
  POST(
    new Request(
      'https://crm.test/api/clinic/appointments/appointment/restore-benefit',
      { method: 'POST', body: JSON.stringify(body) }
    ),
    { params: Promise.resolve({ id: 'appointment' }) }
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account', userId: 'owner' });
  appointment = {
    id: 'appointment',
    status: 'cancelled',
    contact_id: 'client',
    paid_at: '2026-10-31T12:00:00Z',
  };
  benefit = {
    id: 'benefit',
    account_id: 'account',
    appointment_id: 'appointment',
    contact_id: 'client',
    status: 'consumed',
    benefit_type: 'voucher',
    voucher_id: 'voucher',
    client_pack_id: 'pack',
    client_pack_balance_id: 'balance',
    reserved_amount: 25,
    reserved_sessions: 1,
  };
  source = {
    id: 'voucher',
    status: 'used',
    voucher_type: 'service',
    remaining_uses: 0,
    current_balance: 0,
    initial_balance: 89,
    paid_amount: 50,
    owner_contact_id: 'client',
    contact_id: 'client',
    issued_sale_id: 'sale',
    sale_id: 'sale',
    expires_at: '2099-01-01T00:00:00Z',
  };
  balance = { used_sessions: 2, remaining_sessions: 0, total_sessions: 2 };
  saleStatus = 'paid';
  mocks.execute.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.includes('FROM profiles')) return [[{ full_name: 'Proprietário' }]];
    if (sql.startsWith('SELECT paid_at'))
      return [[{ paid_at: appointment.paid_at }]];
    if (sql.includes('FROM clinic_appointments')) {
      expect(values).toEqual(['appointment', 'account']);
      return [[{ ...appointment }]];
    }
    if (sql.includes('SELECT * FROM finance_appointment_benefits')) {
      expect(values).toEqual(['benefit', 'appointment', 'account']);
      expect(sql).toContain('FOR UPDATE');
      return [[{ ...benefit }]];
    }
    if (
      sql.includes('SELECT * FROM finance_vouchers') ||
      sql.includes('SELECT * FROM finance_client_packs')
    )
      return [[{ ...source }]];
    if (sql.includes('SELECT * FROM finance_client_pack_balances'))
      return [[{ ...balance }]];
    if (sql.includes('SELECT status FROM finance_sales'))
      return [[{ status: saleStatus }]];
    if (sql.startsWith('UPDATE finance_vouchers SET remaining_uses')) {
      source.remaining_uses = values[0];
      source.current_balance = values[1];
      source.status = values[2];
    }
    if (sql.startsWith('UPDATE finance_vouchers SET current_balance')) {
      source.current_balance = values[0];
      source.status = values[1];
    }
    if (sql.startsWith('UPDATE finance_client_pack_balances')) {
      balance.used_sessions = Number(balance.used_sessions) - Number(values[0]);
      balance.remaining_sessions =
        Number(balance.remaining_sessions) + Number(values[1]);
    }
    if (sql.startsWith('UPDATE finance_appointment_benefits'))
      benefit.status = 'released';
    if (sql.startsWith('UPDATE clinic_appointments')) {
      expect(sql).toContain('NOT EXISTS');
      appointment.paid_at = null;
    }
    return [{ affectedRows: 1 }];
  });
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation(
    (work: (connection: unknown) => Promise<unknown>) => {
      const task = queue.then(async () => {
        const previous = structuredClone({
          appointment,
          benefit,
          source,
          balance,
        });
        try {
          return await work({ execute: mocks.execute });
        } catch (error) {
          ({ appointment, benefit, source, balance } = previous);
          throw error;
        }
      });
      queue = task.then(
        () => undefined,
        () => undefined
      );
      return task;
    }
  );
});
it('restores the service use, preserves the purchase price and audits the owner approval', async () => {
  expect((await call()).status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('owner');
  expect(source.remaining_uses).toBe(1);
  expect(source.current_balance).toBe(89);
  expect(source.paid_amount).toBe(50);
  expect(benefit.status).toBe('released');
  expect(appointment.status).toBe('cancelled');
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO finance_benefit_logs')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      sql.includes('INSERT INTO clinic_agenda_events')
    )
  ).toBe(true);
  expect(
    mocks.execute.mock.calls.some(([sql]) =>
      /^UPDATE finance_(sales|payments|cash)/.test(sql)
    )
  ).toBe(false);
});
it('restores only the consumed gift-card amount', async () => {
  source.voucher_type = 'gift_card';
  source.current_balance = 40;
  source.initial_balance = 100;
  expect((await call()).status).toBe(200);
  expect(source.current_balance).toBe(65);
});
it('restores only the used pack modality and quantity', async () => {
  benefit.benefit_type = 'pack';
  source.status = 'consumed';
  expect((await call()).status).toBe(200);
  expect(balance).toEqual({
    used_sessions: 1,
    remaining_sessions: 1,
    total_sessions: 2,
  });
  expect(
    mocks.execute.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE finance_client_pack_balances')
    )?.[1]
  ).toEqual([1, 1, 'balance', 'pack']);
});
it('keeps the original expiry instead of silently extending it', async () => {
  source.expires_at = '2020-01-01T00:00:00Z';
  const response = await call();
  expect((await response.json()).status).toBe('expired');
  expect(source.expires_at).toBe('2020-01-01T00:00:00Z');
});
it('cannot credit a second time on concurrent or repeated requests', async () => {
  const results = await Promise.all([call(), call()]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(source.remaining_uses).toBe(1);
  expect((await results[1].json()).alreadyRestored).toBe(true);
  expect(
    mocks.execute.mock.calls.filter(([sql]) =>
      sql.startsWith('UPDATE finance_vouchers')
    ).length
  ).toBe(1);
});
it.each(['confirmed', 'completed'])(
  'rejects %s appointments before changing benefits',
  async (status) => {
    appointment.status = status;
    expect((await call()).status).toBe(409);
    expect(source.remaining_uses).toBe(0);
  }
);
it.each(['cancelled', 'pending'])(
  'does not revive a %s benefit',
  async (status) => {
    source.status = status;
    expect((await call()).status).toBe(409);
    expect(benefit.status).toBe('consumed');
  }
);
it('does not revive a refunded purchase', async () => {
  saleStatus = 'refunded';
  expect((await call()).status).toBe(409);
  expect(source.remaining_uses).toBe(0);
});
it('rejects a benefit transferred to a different client', async () => {
  source.owner_contact_id = 'other';
  expect((await call()).status).toBe(409);
});
it('rejects a mismatched benefit client or missing consumption', async () => {
  benefit.contact_id = 'other';
  expect((await call()).status).toBe(409);
  benefit.contact_id = 'client';
  benefit.status = 'reserved';
  expect((await call()).status).toBe(409);
});
it('rolls back the credit if its history cannot be recorded', async () => {
  const impl = mocks.execute.getMockImplementation()!;
  mocks.execute.mockImplementation(async (...args: unknown[]) => {
    if (String(args[0]).includes('INSERT INTO finance_benefit_logs'))
      throw Error('Audit unavailable');
    return impl(...args);
  });
  expect((await call()).status).toBe(500);
  expect(source.remaining_uses).toBe(0);
  expect(benefit.status).toBe('consumed');
});
it('requires a reason and an authenticated owner before starting the transaction', async () => {
  expect((await call({ benefitId: 'benefit', reason: '' })).status).toBe(400);
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.role.mockRejectedValueOnce(Error('Denied'));
  expect((await call()).status).toBe(500);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

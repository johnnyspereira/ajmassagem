import { expect, it, vi } from 'vitest';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  commitHistoricalAppointments,
  historicalCutoff,
  historicalPlan,
  readHistoricalCandidates,
} from './historical-appointments';

const packet = (values: object[]) => values as RowDataPacket[];
const appointment = {
  id: '00000000-0000-4000-8000-000000000001',
  contact_id: 'client',
  service_id: 'service',
  price: '45.50',
  currency: 'EUR',
  status: 'scheduled',
  scheduled_start: new Date('2026-09-01T12:00:00Z'),
  scheduled_end: new Date('2026-09-01T12:50:00Z'),
  updated_at: new Date('2026-09-01'),
  client_name: 'Cliente de teste',
  service_name: 'Serviço de teste',
};
function fixture(sales: object[] = [], benefits: object[] = []) {
  let completed = false;
  const execute = vi.fn(async (sql: string, values: unknown[] = []) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.includes('SELECT a.*'))
      return [completed ? [] : [{ ...appointment }]];
    if (sql.includes('SELECT id,status,total_amount')) return [sales];
    if (sql.includes('SELECT id,status,consumed_at')) return [benefits];
    if (sql.startsWith('UPDATE clinic_appointments')) completed = true;
    return [[]];
  });
  return { execute, connection: { execute } as unknown as PoolConnection };
}
const cutoff = new Date('2026-10-31T00:00:00Z');
it('refuses oversized batches instead of silently truncating them', async () => {
  const connection = {
    execute: vi.fn().mockResolvedValue([Array(201).fill(appointment)]),
  } as unknown as PoolConnection;
  await expect(
    readHistoricalCandidates(connection, 'account', cutoff, '')
  ).rejects.toThrow('200');
});
it('rechecks reserved benefits before committing and writes nothing', async () => {
  const { execute, connection } = fixture([], [{ status: 'reserved' }]);
  const { candidates } = await readHistoricalCandidates(
    connection,
    'account',
    cutoff,
    ''
  );
  await expect(
    commitHistoricalAppointments(
      connection,
      'account',
      'owner',
      cutoff,
      candidates,
      'Revisão'
    )
  ).rejects.toThrow('mudou');
  expect(execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(
    false
  );
});
it('uses Lisbon midnight through summer time and rejects future or invalid dates', () => {
  expect(
    historicalCutoff(
      '2026-07-01',
      new Date('2026-07-01T12:00:00Z')
    ).toISOString()
  ).toBe('2026-06-30T23:00:00.000Z');
  expect(() => historicalCutoff('2026-11-01', cutoff)).toThrow();
  expect(() => historicalCutoff('2026-02-30', cutoff)).toThrow();
});
it.each(['open', 'partially_paid', 'refunded', 'voided'])(
  'excludes a %s sale instead of erasing debt or reviving refunds',
  (status) => {
    expect(historicalPlan(packet([{ status, balance_due: 1 }]), []).plan).toBe(
      'excluded'
    );
  }
);
it('preserves paid sales and consumed benefits; reserved benefits require individual review', () => {
  expect(
    historicalPlan(packet([{ status: 'paid', balance_due: 0 }]), []).plan
  ).toBe('complete');
  expect(historicalPlan([], packet([{ status: 'consumed' }])).plan).toBe(
    'complete'
  );
  expect(historicalPlan([], packet([{ status: 'reserved' }])).plan).toBe(
    'excluded'
  );
});
it('creates historical records at the original amount/date, no payments or cash writes, with audit and pending-only anamnesis revocation', async () => {
  const { execute, connection } = fixture();
  const { candidates } = await readHistoricalCandidates(
    connection,
    'account',
    cutoff,
    ''
  );
  const result = await commitHistoricalAppointments(
    connection,
    'account',
    'owner',
    cutoff,
    candidates,
    'Histórico autorizado'
  );
  expect(result).toMatchObject({ completed: 1, historical: 1 });
  const writes = execute.mock.calls.filter(([sql]) =>
    /^(INSERT|UPDATE)/.test(sql)
  );
  expect(writes.map(([sql]) => sql).join('\n')).not.toMatch(
    /finance_(payments|cash_movements|cash_sessions)/
  );
  const sale = writes.find(([sql]) =>
    sql.startsWith('INSERT INTO finance_sales')
  )!;
  expect(sale[0]).toContain("'paid',?,?,?,0,0,1");
  expect(sale[1]).toContain(45.5);
  expect(sale[1]).toContain(appointment.scheduled_start);
  expect(writes.some(([sql]) => sql.includes('finance_audit_events'))).toBe(
    true
  );
  expect(
    writes.some(
      ([sql]) =>
        sql.includes("status='revoked'") && sql.includes("status='pending'")
    )
  ).toBe(true);
  await expect(
    commitHistoricalAppointments(
      connection,
      'account',
      'owner',
      cutoff,
      candidates,
      'Repeated request'
    )
  ).rejects.toThrow('mudou');
  expect(
    execute.mock.calls.filter(([sql]) =>
      sql.startsWith('INSERT INTO finance_sales')
    )
  ).toHaveLength(1);
});
it.each([{ sales: [{ status: 'paid', balance_due: 0 }] }, { sales: [] }])(
  'does not create a second sale for already settled appointments',
  async ({ sales }) => {
    const { execute, connection } = fixture(
      sales,
      sales.length ? [] : [{ status: 'consumed' }]
    );
    const { candidates } = await readHistoricalCandidates(
      connection,
      'account',
      cutoff,
      ''
    );
    expect(
      (
        await commitHistoricalAppointments(
          connection,
          'account',
          'owner',
          cutoff,
          candidates,
          'Já liquidado'
        )
      ).historical
    ).toBe(0);
    expect(
      execute.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO finance_sales')
      )
    ).toBe(false);
  }
);
it('rejects stale previews before any writes', async () => {
  const { execute, connection } = fixture();
  await expect(
    commitHistoricalAppointments(
      connection,
      'account',
      'owner',
      cutoff,
      [{ id: appointment.id, revision: 'stale' }],
      'Motivo'
    )
  ).rejects.toThrow('mudou');
  expect(execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(
    false
  );
});
it('binds tenant, cutoff and literal search; only pending states before the cutoff', async () => {
  const { execute, connection } = fixture();
  await readHistoricalCandidates(connection, 'account', cutoff, 'x%_');
  const [sql, values] = execute.mock.calls[0];
  expect(sql).toContain(
    "a.status IN ('scheduled','confirmed') AND a.scheduled_end<?"
  );
  expect(values).toEqual(['account', cutoff, '%x!%!_%', '%x!%!_%']);
});

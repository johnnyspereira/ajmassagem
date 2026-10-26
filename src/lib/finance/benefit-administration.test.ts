import { beforeEach, expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { validateBenefitExpiry } from './benefit-administration';
const input = {
  accountId: 'account',
  userId: 'owner',
  sourceId: 'voucher',
  kind: 'voucher' as const,
  appointmentId: 'appointment',
  scheduledStart: '2026-11-01T12:00:00Z',
  allowExpired: false,
  reason: '',
};
beforeEach(() => vi.useRealTimers());
function connection(row: unknown, owner = true) {
  const execute = vi
    .fn()
    .mockImplementation(async (sql: string, values: unknown[]) => {
      expect((sql.match(/\?/g) || []).length).toBe(values.length);
      if (sql.includes('FROM profiles'))
        return [owner ? [{ user_id: 'owner' }] : []];
      if (sql.startsWith('SELECT')) return [row ? [row] : []];
      return [{ affectedRows: 1 }];
    });
  return { execute, db: { execute } as unknown as PoolConnection };
}
it('rejects an expired benefit without explicit authorization', async () => {
  const { db, execute } = connection({
    status: 'active',
    expires_at: '2020-01-01',
  });
  await expect(validateBenefitExpiry(db, input)).rejects.toThrow('autorização');
  expect(execute).toHaveBeenCalledOnce();
});
it('rejects staff attempting an owner exception', async () => {
  const { db, execute } = connection(
    { status: 'expired', expires_at: '2020-01-01' },
    false
  );
  await expect(
    validateBenefitExpiry(db, {
      ...input,
      allowExpired: true,
      reason: 'Exceção autorizada',
    })
  ).rejects.toThrow('proprietário');
  expect(execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
    false
  );
});
it.each(['voucher', 'pack'] as const)(
  'records an owner exception for %s without extending its validity',
  async (kind) => {
    const { db, execute } = connection({
      status: 'expired',
      expires_at: '2020-01-01',
    });
    await expect(
      validateBenefitExpiry(db, {
        ...input,
        kind,
        allowExpired: true,
        reason: 'Autorizado por cortesia',
      })
    ).resolves.toBeUndefined();
    const call = execute.mock.calls.find(([sql]) => sql.startsWith('INSERT'));
    expect(call?.[0]).toContain(
      kind === 'voucher' ? 'voucher_id' : 'client_pack_id'
    );
    expect(call?.[1]).toContain('appointment');
    expect(execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
      false
    );
  }
);
it.each(['cancelled', 'used', 'pending', 'consumed'])(
  'never reactivates %s benefits',
  async (status) => {
    const { db } = connection({ status, expires_at: '2020-01-01' });
    await expect(
      validateBenefitExpiry(db, {
        ...input,
        allowExpired: true,
        reason: 'Autorizado por cortesia',
      })
    ).rejects.toThrow('inativo');
  }
);
it('checks expiry at the appointment date, not just today', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  const { db } = connection({
    status: 'active',
    expires_at: '2026-10-30T23:59:59Z',
  });
  await expect(validateBenefitExpiry(db, input)).rejects.toThrow('expirado');
});
it('allows a valid benefit without requiring an owner', async () => {
  const { db, execute } = connection(
    { status: 'active', expires_at: null },
    false
  );
  await expect(validateBenefitExpiry(db, input)).resolves.toBeUndefined();
  expect(execute).toHaveBeenCalledOnce();
});

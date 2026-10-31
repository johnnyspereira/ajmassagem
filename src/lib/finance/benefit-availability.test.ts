import { describe, expect, it } from 'vitest';
import {
  benefitState,
  benefitOrder,
  matchesBenefitFilter,
  packRemaining,
  voucherRemaining,
} from './benefit-availability';
import type { FinanceClientPack, FinanceVoucher } from '@/types';
const now = Date.parse('2026-10-31T12:00:00Z');
describe('benefit availability presented to operators', () => {
  it('does not count an active record with zero sessions as usable', () =>
    expect(benefitState({ status: 'active' }, 0, now)).toBe('used'));
  it('shows a spent voucher as used even after its old expiry', () =>
    expect(
      benefitState({ status: 'expired', expires_at: '2026-10-01' }, 0, now)
    ).toBe('used'));
  it('keeps a positive but expired balance distinct from a spent balance', () =>
    expect(
      benefitState({ status: 'active', expires_at: '2026-10-01' }, 1, now)
    ).toBe('expired'));
  it('marks seven-day expiry as usable and needing attention', () => {
    const state = benefitState(
      { status: 'active', expires_at: '2026-11-03T12:00:00Z' },
      2,
      now
    );
    expect(state).toBe('expiring');
    expect(matchesBenefitFilter(state, 'available')).toBe(true);
    expect(matchesBenefitFilter(state, 'expired')).toBe(false);
  });
  it('preserves cancellation and pending payment before considering balance', () => {
    expect(benefitState({ status: 'cancelled' }, 0, now)).toBe('cancelled');
    expect(benefitState({ status: 'pending' }, 0, now)).toBe('pending');
  });
  it('supports perpetual benefits without pretending they expire', () =>
    expect(benefitState({ status: 'active' }, 1, now)).toBe('available'));
  it('sums only positive pack balances across modalities', () =>
    expect(
      packRemaining({
        balances: [
          { remaining_sessions: 2 },
          { remaining_sessions: 1 },
          { remaining_sessions: 0 },
        ],
      } as FinanceClientPack)
    ).toBe(3));
  it('does not confuse money with service uses', () => {
    expect(
      voucherRemaining({
        voucher_type: 'service',
        remaining_uses: 1,
        current_balance: 89,
      } as FinanceVoucher)
    ).toBe(1);
    expect(
      voucherRemaining({
        voucher_type: 'gift_card',
        remaining_uses: 0,
        current_balance: 25,
      } as FinanceVoucher)
    ).toBe(25);
  });
  it('puts usable expiring benefits ahead of available, expired and used history', () => {
    const records = [
      { state: 'used' as const },
      { state: 'available' as const },
      { state: 'expired' as const },
      { state: 'expiring' as const },
    ];
    expect(records.sort(benefitOrder).map((item) => item.state)).toEqual([
      'expiring',
      'available',
      'expired',
      'used',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { availableVoucher, availablePackSessions } from './available-benefits';
import type { FinanceVoucher } from '@/types';
const voucher = {
  id: 'v',
  status: 'active',
  voucher_type: 'service',
  remaining_uses: 1,
  current_balance: 45,
} as FinanceVoucher;
describe('Inbox available benefits', () => {
  it('hides used, reserved, expired and cancelled service vouchers', () => {
    expect(availableVoucher({ ...voucher, remaining_uses: 0 }, [])).toBeNull();
    expect(
      availableVoucher(voucher, [{ voucher_id: 'v', status: 'reserved' }])
    ).toBeNull();
    expect(
      availableVoucher({ ...voucher, status: 'cancelled' }, [])
    ).toBeNull();
    expect(
      availableVoucher({ ...voucher, expires_at: '2020-01-01' }, [])
    ).toBeNull();
    expect(
      availableVoucher({ ...voucher, current_balance: 0 }, [])
    ).not.toBeNull();
  });
  it('subtracts held value without hiding unused sessions', () => {
    expect(
      availableVoucher(
        { ...voucher, voucher_type: 'gift_card', current_balance: 50 },
        [{ voucher_id: 'v', status: 'reserved', reserved_amount: 30 }]
      )?.current_balance
    ).toBe(20);
    expect(
      availablePackSessions('b', 2, [
        {
          client_pack_balance_id: 'b',
          status: 'reserved',
          reserved_sessions: 1,
        },
        {
          client_pack_balance_id: 'b',
          status: 'consumed',
          reserved_sessions: 1,
        },
      ])
    ).toBe(1);
  });
});

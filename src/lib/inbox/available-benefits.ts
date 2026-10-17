import type { FinanceVoucher } from '@/types';

export interface BenefitReservation {
  voucher_id?: string | null;
  client_pack_balance_id?: string | null;
  reserved_amount?: number | string | null;
  reserved_sessions?: number | string | null;
  status?: string;
}
export function usableExpiry(expires?: string | null, now = Date.now()) {
  return !expires || new Date(expires).getTime() > now;
}
export function availableVoucher(
  voucher: FinanceVoucher,
  reservations: BenefitReservation[],
  now = Date.now()
) {
  if (voucher.status !== 'active' || !usableExpiry(voucher.expires_at, now))
    return null;
  const held = reservations.filter(
    (item) => item.voucher_id === voucher.id && item.status === 'reserved'
  );
  if (voucher.voucher_type === 'service') {
    const remaining = Math.max(
      0,
      Number(voucher.remaining_uses || 0) - held.length
    );
    return remaining > 0 ? { ...voucher, remaining_uses: remaining } : null;
  }
  const balance = Math.max(
    0,
    Number(voucher.current_balance || 0) -
      held.reduce((sum, item) => sum + Number(item.reserved_amount || 0), 0)
  );
  return balance > 0 ? { ...voucher, current_balance: balance } : null;
}
export function availablePackSessions(
  id: string,
  remaining: number,
  reservations: BenefitReservation[]
) {
  return Math.max(
    0,
    Number(remaining) -
      reservations
        .filter(
          (item) =>
            item.client_pack_balance_id === id && item.status === 'reserved'
        )
        .reduce((sum, item) => sum + Number(item.reserved_sessions || 0), 0)
  );
}
export type InboxBookingBenefit = {
  type: 'voucher' | 'pack';
  id: string;
  label: string;
  serviceId?: string | null;
};

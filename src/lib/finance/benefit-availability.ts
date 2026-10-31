import type { FinanceClientPack, FinanceVoucher } from '@/types';

export type BenefitState =
  'available' | 'expiring' | 'expired' | 'used' | 'pending' | 'cancelled';
export type BenefitFilter =
  'available' | 'expiring' | 'expired' | 'used' | 'pending' | 'all';
export const BENEFIT_STATE_LABEL: Record<BenefitState, string> = {
  available: 'Disponível',
  expiring: 'A terminar',
  expired: 'Expirado',
  used: 'Utilizado',
  pending: 'Por ativar',
  cancelled: 'Cancelado',
};
export function packRemaining(pack: FinanceClientPack) {
  return (pack.balances ?? []).reduce(
    (sum, balance) =>
      sum + Math.max(0, Number(balance.remaining_sessions || 0)),
    0
  );
}
export function voucherRemaining(voucher: FinanceVoucher) {
  return Math.max(
    0,
    Number(
      voucher.voucher_type === 'service'
        ? voucher.remaining_uses
        : voucher.current_balance
    ) || 0
  );
}
export function benefitState(
  item: { status: string; expires_at?: string | null },
  remaining: number,
  now: number
): BenefitState {
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'pending') return 'pending';
  // A used benefit remains used even if its old expiry date has passed.
  if (remaining <= 0 || ['used', 'consumed'].includes(item.status))
    return 'used';
  const expiry = item.expires_at ? Date.parse(item.expires_at) : Infinity;
  if (item.status === 'expired' || expiry <= now) return 'expired';
  if (expiry <= now + 7 * 86_400_000) return 'expiring';
  return 'available';
}
export function matchesBenefitFilter(
  state: BenefitState,
  filter: BenefitFilter
) {
  return (
    filter === 'all' ||
    state === filter ||
    (filter === 'available' && state === 'expiring')
  );
}
export function benefitOrder(
  left: { state: BenefitState; expires_at?: string | null },
  right: { state: BenefitState; expires_at?: string | null }
) {
  const rank: Record<BenefitState, number> = {
    expiring: 0,
    available: 1,
    pending: 2,
    expired: 3,
    used: 4,
    cancelled: 5,
  };
  return (
    rank[left.state] - rank[right.state] ||
    (left.expires_at ? Date.parse(left.expires_at) : Infinity) -
      (right.expires_at ? Date.parse(right.expires_at) : Infinity) ||
    0
  );
}

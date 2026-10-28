export function benefitState(
  status: string,
  expiresAt: string | null | undefined,
  available: number,
  now: number
) {
  if (['used', 'consumed', 'redeemed'].includes(status)) return 'used';
  if (status !== 'active') return status;
  if (available <= 0) return 'used';
  if (expiresAt && new Date(expiresAt).getTime() <= now) return 'expired';
  return 'available';
}
export const benefitStateLabel: Record<string, string> = {
  available: 'Disponível',
  active: 'Ativo',
  used: 'Utilizado',
  expired: 'Expirado',
  pending: 'Pendente',
  pending_payment: 'Aguarda pagamento',
  voided: 'Anulado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  inactive: 'Inativo',
};

export type CampaignKind = 'promotional' | 'exchange';
export function campaignVisible(kind: unknown, balance: number) {
  return kind === 'exchange' || !(balance > 0);
}
export function campaignAmounts(price: number, balance: number, kind: unknown) {
  if (!Number.isFinite(balance))
    throw new Error('Não foi possível apurar o saldo do cartão.');
  const total = Math.round(price * 100);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 99999999)
    throw new Error('Preço da campanha inválido.');
  if (kind !== 'promotional' && kind !== 'exchange')
    throw new Error('Tipo de campanha inválido.');
  if (!campaignVisible(kind, balance))
    throw new Error(
      'As campanhas promocionais não estão disponíveis para clientes com saldo no cartão.'
    );
  const wallet =
    kind === 'exchange'
      ? Math.min(total, Math.max(0, Math.round(balance * 100)))
      : 0;
  return {
    total: total / 100,
    wallet: wallet / 100,
    due: (total - wallet) / 100,
  };
}

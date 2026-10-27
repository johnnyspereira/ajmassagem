export function appointmentPaymentAction(input: {
  cancelled: boolean;
  paid: boolean;
  benefitType: 'direct' | 'voucher' | 'pack';
  benefitStatus?: string | null;
  outstanding: number;
  hasPaidSale?: boolean;
}) {
  if (input.cancelled)
    return {
      label: 'Marcação cancelada',
      disabled: true,
      kind: 'none' as const,
    };
  if (input.benefitStatus === 'consumed')
    return {
      label:
        input.benefitType === 'pack'
          ? 'Sessão do pack utilizada'
          : 'Voucher utilizado',
      disabled: true,
      kind: 'none' as const,
    };
  if (input.paid || input.hasPaidSale)
    return {
      label: 'Pago · sem saldo a receber',
      disabled: true,
      kind: 'none' as const,
    };
  if (input.benefitType !== 'direct')
    return {
      label:
        input.benefitType === 'pack'
          ? 'Utilizar sessão do pack'
          : 'Utilizar voucher',
      disabled: false,
      kind: 'benefit' as const,
    };
  if (input.outstanding <= 0)
    return {
      label: 'Sem valor a receber',
      disabled: true,
      kind: 'none' as const,
    };
  return { label: 'Receber', disabled: false, kind: 'cash' as const };
}

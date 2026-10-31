import { formatCurrency } from '@/lib/currency';

export type SettlementAppointment = {
  price: number;
  currency: string;
  status: string;
  paid_at?: string | null;
  benefits?: Array<{
    status: string;
    benefit_type: string;
    voucher?: { code?: string | null } | null;
    client_pack?: { code?: string | null } | null;
  }>;
  sales?: Array<{
    status: string;
    paid_amount: number;
    balance_due: number;
    payments?: Array<{ status: string; method: string; amount: number }>;
  }>;
};

export type SettlementTag = {
  label: string;
  tone: 'paid' | 'pending' | 'benefit' | 'neutral';
};

const METHODS: Record<string, string> = {
  cash: 'Dinheiro',
  card: 'Cartão',
  mb_way: 'MB WAY',
  multibanco: 'Multibanco',
  bank_transfer: 'Transferência',
  voucher: 'Voucher',
  client_credit: 'Cartão-saldo',
  other: 'Outro',
};

/** A reservation is not a redemption; a legacy paid marker never implies cash. */
export function appointmentSettlementTags(
  appointment: SettlementAppointment
): SettlementTag[] {
  const tags: SettlementTag[] = [];
  const consumed =
    appointment.benefits?.filter((item) => item.status === 'consumed') ?? [];
  const reserved =
    appointment.benefits?.filter((item) => item.status === 'reserved') ?? [];
  for (const benefit of [...consumed, ...reserved]) {
    const used = benefit.status === 'consumed';
    const name = benefit.benefit_type === 'pack' ? 'Pack' : 'Voucher';
    const code =
      benefit.benefit_type === 'pack'
        ? benefit.client_pack?.code
        : benefit.voucher?.code;
    tags.push({
      label: `${name} ${used ? 'utilizado' : 'reservado · falta utilizar'}${code ? ` · ${code}` : ''}`,
      tone: used ? 'benefit' : 'pending',
    });
  }
  const sales =
    appointment.sales?.filter(
      (sale) => !['voided', 'refunded'].includes(sale.status)
    ) ?? [];
  const methods = [
    ...new Set(
      sales.flatMap((sale) =>
        (sale.payments ?? [])
          .filter(
            (payment) =>
              payment.status === 'confirmed' && Number(payment.amount) > 0
          )
          .map((payment) => METHODS[payment.method] ?? payment.method)
      )
    ),
  ];
  const due = sales.reduce(
    (sum, sale) => sum + Math.max(0, Number(sale.balance_due)),
    0
  );
  const received = sales.reduce(
    (sum, sale) => sum + Math.max(0, Number(sale.paid_amount)),
    0
  );
  const refundedOnly =
    !sales.length &&
    appointment.sales?.some((sale) => sale.status === 'refunded');
  if (due > 0) {
    if (received > 0)
      tags.push({
        label: `Pagamento parcial${methods.length ? ` · ${methods.join(' + ')}` : ''}`,
        tone: 'neutral',
      });
    tags.push({
      label: `Por pagar · ${formatCurrency(due, appointment.currency)}`,
      tone: 'pending',
    });
  } else if (
    received > 0 ||
    sales.some((sale) => sale.status === 'paid') ||
    (appointment.paid_at && !refundedOnly)
  ) {
    if (!consumed.length || methods.length)
      tags.push({
        label: `Pago · ${methods.length ? methods.join(' + ') : 'meio não registado'}`,
        tone: 'paid',
      });
  } else if (!consumed.length && !reserved.length) {
    if (appointment.sales?.some((sale) => sale.status === 'refunded'))
      tags.push({ label: 'Pagamento reembolsado', tone: 'neutral' });
    else if (appointment.status === 'cancelled')
      tags.push({ label: 'Sem pagamento registado', tone: 'neutral' });
    else if (Number(appointment.price) > 0)
      tags.push({ label: 'Pagamento pendente', tone: 'pending' });
    else tags.push({ label: 'Sem valor a receber', tone: 'neutral' });
  }
  return tags;
}

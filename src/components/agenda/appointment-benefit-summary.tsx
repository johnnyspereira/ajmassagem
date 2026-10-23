import Link from 'next/link';
import { formatCurrency } from '@/lib/currency';
import type { FinanceAppointmentBenefit } from '@/types';

export function AppointmentBenefitSummary({
  benefit,
  currency,
}: {
  benefit: FinanceAppointmentBenefit;
  currency: string;
}) {
  const voucher = benefit.voucher;
  const paid = voucher?.paid_amount;
  const known =
    paid != null && Number.isFinite(Number(paid)) && Number(paid) >= 0;
  const voucherCurrency = voucher?.currency || currency;
  return (
    <div
      className="mt-3 space-y-2 rounded-md border p-3 text-xs"
      aria-label="Valores do benefício"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-emerald-700 dark:text-emerald-300">
        <span>
          {benefit.status === 'consumed'
            ? 'Benefício consumido'
            : 'Benefício reservado'}
        </span>
        <span className="font-medium">
          {benefit.benefit_type === 'voucher'
            ? voucher?.voucher_type === 'service'
              ? '1 sessão de voucher'
              : 'Voucher de saldo'
            : '1 sessão de pack'}
        </span>
      </div>
      {benefit.benefit_type === 'voucher' ? (
        <>
          <dl className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt>Valor pago pelo voucher</dt>
              <dd className="text-base font-semibold tabular-nums">
                {known
                  ? formatCurrency(Number(paid), voucherCurrency)
                  : 'Por apurar'}
              </dd>
            </div>
            <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2">
              <dt>Valor aplicado à sessão</dt>
              <dd className="tabular-nums">
                {formatCurrency(Number(benefit.reserved_amount), currency)}
              </dd>
            </div>
          </dl>
          <p className="text-muted-foreground">
            {known
              ? 'O valor pago corresponde à compra do voucher, com os descontos registados. O valor aplicado corresponde à cobertura desta sessão.'
              : 'O valor aplicado à sessão não comprova quanto foi pago. Consulte a compra original para apurar o pagamento.'}
          </p>
          {voucher?.issued_sale_id ? (
            <Link
              className="text-primary inline-block underline underline-offset-4"
              href={`/finance?tab=sales#sale-${voucher.issued_sale_id}`}
            >
              Consultar compra original
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

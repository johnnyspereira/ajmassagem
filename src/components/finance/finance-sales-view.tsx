'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, CircleDollarSign, Download, ReceiptText, RotateCcw, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty, NativeSelect } from '@/components/finance/finance-ui';
import { downloadReceiptPdf } from '@/lib/finance/receipt-pdf';
import { money, PAYMENT_METHODS, SALE_STATUS } from '@/components/finance/finance-utils';
import type { FinanceSale } from '@/types';

export function SalesView({
  sales,
  currency,
  onPayment,
  onReverse,
  canOperate,
  canRefund,
  brand,
}: {
  sales: FinanceSale[];
  currency: string;
  onPayment: (sale: FinanceSale) => void;
  onReverse: (sale: FinanceSale) => void;
  canOperate: boolean;
  canRefund: boolean;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return sales.filter((sale) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'active'
          ? !['voided', 'refunded'].includes(sale.status)
          : sale.status === status);
      const haystack =
        `${sale.sale_number} ${sale.contact?.name ?? ''} ${sale.contact?.phone ?? ''} ${(sale.items ?? []).map((item) => item.name_snapshot).join(' ')}`.toLocaleLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, sales, status]);

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar venda, cliente, telefone ou item..."
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={setStatus}>
          <option value="active">Vendas operacionais</option>
          <option value="all">Todos os estados</option>
          <option value="open">Pendentes</option>
          <option value="partially_paid">Parciais</option>
          <option value="paid">Pagas</option>
          <option value="voided">Anuladas</option>
          <option value="refunded">Reembolsadas</option>
        </NativeSelect>
      </div>
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          {filtered.length} registos encontrados
        </span>
        <p className="text-muted-foreground">
          Pagamentos e alterações permanecem ligados à venda original.
        </p>
      </div>
      <div className="divide-border divide-y">
        {filtered.length === 0 ? (
          <Empty icon={ReceiptText} text="Ainda não existem vendas." />
        ) : (
          filtered.map((sale) => (
            <details
              key={sale.id}
              id={`sale-${sale.id}`}
              className="group target:bg-primary/5 target:ring-primary/30 scroll-mt-24 target:ring-2"
            >
              <summary className="grid cursor-pointer list-none items-center gap-3 p-4 md:grid-cols-[90px_1fr_130px_130px_auto]">
                <div>
                  <p className="font-mono text-xs">#{sale.sale_number}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {sale.contact?.name ||
                      sale.contact?.phone ||
                      'Consumidor final'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {sale.items?.map((item) => item.name_snapshot).join(', ') ||
                      'Venda'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-medium">
                    {money(
                      Number(sale.total_amount),
                      sale.currency || currency
                    )}
                  </p>
                </div>
                <div>
                  <Badge
                    variant={sale.status === 'paid' ? 'default' : 'secondary'}
                  >
                    {SALE_STATUS[sale.status] ?? sale.status}
                  </Badge>
                  {Number(sale.balance_due) > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Falta{' '}
                      {money(
                        Number(sale.balance_due),
                        sale.currency || currency
                      )}
                    </p>
                  )}
                </div>
                <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-border bg-muted/20 border-t px-4 py-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Itens
                    </p>
                    <div className="space-y-1.5">
                      {(sale.items ?? []).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span>
                            {item.quantity}× {item.name_snapshot}
                          </span>
                          <span className="shrink-0 font-medium">
                            {money(Number(item.line_total), sale.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Pagamentos
                    </p>
                    <div className="space-y-1.5">
                      {(sale.payments ?? []).length ? (
                        sale.payments?.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span>
                              {PAYMENT_METHODS.find(
                                (method) => method.value === payment.method
                              )?.label ?? payment.method}{' '}
                              <span className="text-muted-foreground text-xs">
                                · {payment.status}
                              </span>
                            </span>
                            <strong>
                              {money(Number(payment.amount), sale.currency)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          Nenhum pagamento confirmado.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-40 flex-col gap-2">
                    {(sale.payments ?? []).length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadSaleReceipt(sale, brand)}
                      >
                        <Download /> Recibo PDF
                      </Button>
                    ) : null}
                    {Number(sale.balance_due) > 0 &&
                    !['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => onPayment(sale)}
                      >
                        <CircleDollarSign /> Receber saldo
                      </Button>
                    ) : null}
                    {!['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !canOperate ||
                          (Number(sale.paid_amount) > 0 && !canRefund)
                        }
                        onClick={() => onReverse(sale)}
                      >
                        <RotateCcw />
                        {Number(sale.paid_amount) > 0 ? 'Reembolsar' : 'Anular'}
                      </Button>
                    ) : null}
                    {sale.contact?.id ? (
                      <Link
                        href={`/contacts/${sale.contact.id}`}
                        className="hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"
                      >
                        Abrir Cliente 360 <ChevronRight className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
                {sale.notes || sale.void_reason || sale.refund_reason ? (
                  <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                    {sale.refund_reason || sale.void_reason || sale.notes}
                  </p>
                ) : null}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

async function downloadSaleReceipt(
  sale: FinanceSale,
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null }
) {
  await downloadReceiptPdf({
    saleNumber: sale.sale_number,
    createdAt: sale.created_at,
    completedAt: sale.completed_at,
    currency: sale.currency,
    subtotal: Number(sale.subtotal),
    discountAmount: Number(sale.discount_amount),
    taxAmount: Number(sale.tax_amount),
    totalAmount: Number(sale.total_amount),
    paidAmount: Number(sale.paid_amount),
    balanceDue: Number(sale.balance_due),
    business: brand,
    client: {
      name: sale.contact?.name,
      email: sale.contact?.email,
      taxId: sale.contact?.tax_id,
      reference: sale.contact?.client_reference,
    },
    items: (sale.items ?? []).map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount_amount),
      taxRate: Number(item.tax_rate),
      taxAmount: Number(item.tax_amount),
      total: Number(item.line_total),
    })),
    payments: (sale.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
      paidAt: payment.paid_at,
      status: payment.status,
      reference: payment.reference_code,
    })),
  });
}

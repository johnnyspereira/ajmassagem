'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';
import { useAuth } from '@/hooks/use-auth';

type PackSalesData = {
  pack: { id: string; name: string; reference: string | null };
  sold: number;
  sales: number;
  totalRows: number;
  pageSize: number;
  rows: {
    id: string;
    quantity: number;
    line_total: number;
    sale_id: string;
    sale_number: number;
    status: string;
    currency: string;
    created_at: string;
    contact_name: string | null;
    contact_id: string | null;
  }[];
};
const labels: Record<string, string> = {
  paid: 'Paga',
  open: 'Por pagar',
  partially_paid: 'Parcialmente paga',
  partial: 'Parcialmente paga',
  completed: 'Concluída',
};

export function PackSalesReport({ packId }: { packId: string }) {
  const { account } = useAuth();
  const [data, setData] = useState<PackSalesData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/finance/pack-sales?pack=${encodeURIComponent(packId)}&page=${page}`,
          { signal: controller.signal, cache: 'no-store' }
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || 'Não foi possível carregar as vendas.'
          );
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar as vendas.'
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [packId, page, refresh]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link
            href="/settings?tab=clinic&clinicArea=packs"
            className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-4" /> Catálogo de packs
          </Link>
          <h1 className="text-2xl font-semibold">Vendas de packs</h1>
          <p className="font-medium break-words">
            {data?.pack.name || 'A consultar o pacote…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className="size-4" /> Atualizar
          </Button>
          <Link
            href="/reports"
            className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm hover:underline"
          >
            Relatório 360
          </Link>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Total desde o início. Inclui vendas registadas por pagar; exclui vendas
        anuladas, canceladas e reembolsadas. Cada unidade corresponde a um pack,
        não ao número de sessões.
      </p>
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 space-y-3 rounded-xl border p-4"
        >
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-6">
          <Loader2 className="size-5 animate-spin" /> A carregar vendas…
        </div>
      ) : !error && data ? (
        <>
          <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
            <Badge className="px-3 py-1 text-sm">
              {data.sold} {data.sold === 1 ? 'pack vendido' : 'packs vendidos'}
            </Badge>
            <span className="text-muted-foreground text-sm">
              em {data.sales} {data.sales === 1 ? 'venda' : 'vendas'}
              {data.pack.reference ? ` · Ref. ${data.pack.reference}` : ''}
            </span>
          </div>
          <section
            aria-label="Vendas deste pacote"
            className="bg-card overflow-hidden rounded-xl border"
          >
            {data.rows.length ? (
              <ul className="divide-y">
                {data.rows.map((row) => (
                  <li
                    key={row.id}
                    className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium break-words">
                        {row.contact_name || 'Cliente não identificado'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(row.created_at).toLocaleString('pt-PT', {
                          timeZone: account?.timezone || 'Europe/Lisbon',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}{' '}
                        · Venda #{row.sale_number}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span>
                        {Number(row.quantity)}{' '}
                        {Number(row.quantity) === 1 ? 'pack' : 'packs'}
                      </span>
                      <strong>
                        {formatCurrency(Number(row.line_total), row.currency)}
                      </strong>
                      <Badge
                        variant="secondary"
                        className={
                          row.status === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
                        }
                      >
                        {labels[row.status] || row.status}
                      </Badge>
                    </div>
                    <Link
                      href={`/finance?tab=sales#sale-${row.sale_id}`}
                      className="text-primary inline-flex min-h-10 items-center gap-1 text-sm hover:underline"
                    >
                      Ver venda <ArrowUpRight className="size-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground p-8 text-center text-sm">
                Ainda não existem vendas deste pack.
              </p>
            )}
          </section>
          {data.totalRows > data.pageSize ? (
            <nav
              aria-label="Páginas das vendas"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">
                Página {page} de {Math.ceil(data.totalRows / data.pageSize)}
              </span>
              <Button
                variant="outline"
                disabled={page * data.pageSize >= data.totalRows}
                onClick={() => setPage((value) => value + 1)}
              >
                Seguinte
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

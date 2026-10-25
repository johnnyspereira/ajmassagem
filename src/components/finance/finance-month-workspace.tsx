'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Banknote,
  CalendarCheck,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountDateInput } from '@/lib/timezone';
import { formatCurrency } from '@/lib/currency';

type Amount = { currency: string; amount: number; count?: number };
type Pending = {
  id: string;
  sale_number: number;
  created_at: string;
  name: string | null;
  currency: string;
  balance_due: number;
};
type Data = {
  month: string;
  billed: Amount[];
  received: Amount[];
  due: Amount[];
  pending: Pending[];
  earlier: Pending[];
  lastAlert: null | {
    title: string;
    created_at: string;
    whatsapp_status: string | null;
  };
  today: {
    day: string;
    cash: null | { id: string; opened_at: string };
    appointments: {
      id: string;
      name: string | null;
      scheduled_start: string;
    }[];
    hasActivity: boolean;
  };
};
function amounts(rows: Amount[]) {
  return rows.length
    ? rows
        .map((row) => formatCurrency(Number(row.amount), row.currency))
        .join(' · ')
    : formatCurrency(0, 'EUR');
}
export function FinanceMonthWorkspace({
  onCash,
  onPayment,
  canOperate,
  refreshKey,
}: {
  onCash: () => void;
  onPayment: (id: string) => void;
  canOperate: boolean;
  refreshKey: boolean;
}) {
  const [month, setMonth] = useState(() =>
    accountDateInput(new Date(), 'Europe/Lisbon').slice(0, 7)
  );
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  useEffect(() => {
    if (refreshKey) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError('');
        setData(null);
      }
    });
    fetch(`/api/finance/workspace?month=${month}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || 'Não foi possível carregar o mês.');
        setData(body);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [month, refresh, refreshKey]);
  const pending = (data?.pending || []).filter(
    (sale) =>
      accountDateInput(new Date(sale.created_at), 'Europe/Lisbon').slice(
        0,
        7
      ) === month
  );
  const past = data?.earlier || [];
  return (
    <section aria-label="O meu financeiro do mês" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Um mês de cada vez</h2>
          <p className="text-muted-foreground text-sm">
            Veja o mês escolhido. O acumulado do negócio fica nos{' '}
            <Link href="/reports" className="text-primary underline">
              Relatórios
            </Link>
            .
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label
            className="space-y-1 text-xs font-medium"
            htmlFor="finance-month"
          >
            Mês
            <Input
              id="finance-month"
              type="month"
              min="2000-01"
              max="2100-12"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
              className="mt-1 w-44"
            />
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar mês e pendências"
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="border-destructive/40 rounded-xl border p-4 text-sm"
        >
          {error}
          <Button
            variant="outline"
            className="ml-3"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-muted-foreground py-4 text-sm">
          A consultar o mês e as tarefas de hoje…
        </p>
      ) : null}
      {data ? (
        <>
          <div className="bg-card rounded-xl border p-4 sm:p-5">
            <h3 className="font-semibold">Hoje: resolva por esta ordem</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Estas tarefas são sempre de hoje, mesmo quando consulta outro mês.
            </p>
            <div className="mt-4 divide-y">
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-start gap-3">
                  <Banknote className="text-primary mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {data.today.cash
                        ? 'Conferir e fechar o caixa'
                        : 'Abrir o caixa'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {data.today.cash
                        ? 'O turno continua aberto. Conte o dinheiro físico antes de fechar.'
                        : 'Abra quando começar a trabalhar com dinheiro físico.'}
                    </p>
                  </div>
                </div>
                <Button disabled={!canOperate} onClick={onCash}>
                  {data.today.cash ? 'Conferir e fechar' : 'Abrir caixa'}
                </Button>
              </div>
              <div className="py-3">
                <div className="flex items-start gap-3">
                  <CalendarCheck className="text-primary mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">
                      {data.today.appointments.length
                        ? `${data.today.appointments.length} atendimento(s) por concluir`
                        : 'Atendimentos terminados em dia'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Confirme Concluído, Faltou ou Cancelado nas sessões que já
                      terminaram.
                    </p>
                  </div>
                </div>
                {data.today.appointments.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={`/agenda?appointment=${item.id}`}
                    className="mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      {item.name || 'Cliente'} ·{' '}
                      {new Date(item.scheduled_start).toLocaleTimeString(
                        'pt-PT',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Europe/Lisbon',
                        }
                      )}
                    </span>
                    <ArrowRight className="size-4 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Alertas: abertura entre 09:00 e 12:00; revisão às 21:30 e último
              aviso às 23:15, hora de Lisboa, se houver pendências. Dependem do
              agendador local ligado e do WhatsApp disponível.
            </p>
            {data.lastAlert ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Último aviso: {data.lastAlert.title} ·{' '}
                {new Date(data.lastAlert.created_at).toLocaleString('pt-PT', {
                  timeZone: 'Europe/Lisbon',
                })}{' '}
                ·{' '}
                {data.lastAlert.whatsapp_status === 'sent'
                  ? 'aceite pelo WhatsApp'
                  : data.lastAlert.whatsapp_status === 'failed'
                    ? 'falha no WhatsApp; nova tentativa pelo agendador'
                    : data.lastAlert.whatsapp_status === 'not_configured'
                      ? 'número do proprietário por configurar'
                      : 'registado no centro de notificações'}
                .
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Vendido neste mês',
                value: amounts(data.billed),
                help: 'Vendas criadas no mês, sem importações, anulações ou reembolsos.',
              },
              {
                label: 'Recebido neste mês',
                value: amounts(data.received),
                help: 'Pagamentos de vendas recebidos no mês, mesmo de uma venda anterior.',
              },
              {
                label: 'Falta receber destas vendas',
                value: amounts(data.due),
                help: 'Saldo ainda em dívida nas vendas criadas neste mês.',
              },
            ].map((item) => (
              <div key={item.label} className="bg-card rounded-xl border p-4">
                <p className="text-muted-foreground text-sm">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {item.value}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {item.help}
                </p>
              </div>
            ))}
          </div>
          <div className="bg-card rounded-xl border p-4 sm:p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-semibold">Quem falta pagar</h3>
              <span className="text-muted-foreground text-xs">
                Vendas do mês escolhido
              </span>
            </div>
            {pending.length ? (
              pending.map((sale) => (
                <PendingSale
                  key={sale.id}
                  sale={sale}
                  onPayment={onPayment}
                  disabled={!canOperate}
                />
              ))
            ) : (
              <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4" />
                Não há vendas pendentes deste mês na lista.
              </p>
            )}
            {past.length ? (
              <div className="mt-4 border-t pt-3">
                <Button
                  variant="outline"
                  onClick={() => setOlder((value) => !value)}
                >
                  {older ? 'Ocultar' : 'Ver'} dívidas anteriores ({past.length})
                </Button>
                {older
                  ? past.map((sale) => (
                      <PendingSale
                        key={sale.id}
                        sale={sale}
                        onPayment={onPayment}
                        disabled={!canOperate}
                      />
                    ))
                  : null}
              </div>
            ) : null}
            {data.pending.length === 50 ? (
              <p className="text-muted-foreground mt-3 text-xs">
                São apresentadas as 50 dívidas mais antigas. Consulte Vendas
                para procurar outros registos.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
function PendingSale({
  sale,
  onPayment,
  disabled,
}: {
  sale: Pending;
  onPayment: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">
          {sale.name || 'Consumidor final'}
        </p>
        <p className="text-muted-foreground text-xs">
          Venda #{sale.sale_number} ·{' '}
          {new Date(sale.created_at).toLocaleDateString('pt-PT', {
            timeZone: 'Europe/Lisbon',
          })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <strong className="text-sm tabular-nums">
          {formatCurrency(Number(sale.balance_due), sale.currency)}
        </strong>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => onPayment(sale.id)}
        >
          Receber
        </Button>
      </div>
    </div>
  );
}

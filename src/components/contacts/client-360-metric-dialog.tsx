'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMysqlBrowserClient } from '@/lib/mysql/browser-client';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Appointment } from './client-360-page';

export const CLIENT_APPOINTMENT_SELECT =
  'id, scheduled_start, scheduled_end, status, paid_at, source, price, original_price, referral_id, referral_discount_amount, currency, confirmation_status, service:clinic_services(name, color), room:clinic_rooms(name), professional:profiles!clinic_appointments_professional_profile_id_fkey(full_name, email), benefits:finance_appointment_benefits(*, voucher:finance_vouchers(*), client_pack:finance_client_packs(*), client_pack_balance:finance_client_pack_balances(total_sessions, used_sessions, remaining_sessions)), sales:finance_sales(*, payments:finance_payments(*))';

export type ClientMetric =
  'next' | 'conversations' | 'deals' | 'appointments' | 'finance';
const TITLES: Record<ClientMetric, string> = {
  next: 'Próximas marcações',
  conversations: 'Conversas do cliente',
  deals: 'Negócios ativos',
  appointments: 'Atendimentos do cliente',
  finance: 'Recebimentos e valores pendentes',
};
type RecordRow = {
  id: string;
  status: string;
  name?: string;
  title?: string;
  currency?: string;
  value?: number;
  total_amount?: number;
  paid_amount?: number;
  balance_due?: number;
  created_at?: string;
  last_message_at?: string;
  last_message_text?: string;
  unread_count?: number;
  sale_number?: number;
  items?: Array<{ name_snapshot: string }>;
};
const PAGE_SIZE = 30;

export function Client360MetricDialog({
  kind,
  accountId,
  contactId,
  currency,
  renderAppointment,
  onClose,
  onNavigate,
}: {
  kind: ClientMetric;
  accountId: string;
  contactId: string;
  currency: string;
  renderAppointment: (appointment: Appointment) => ReactNode;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const client = useMemo(
    () => createMysqlBrowserClient() as unknown as SupabaseClient,
    []
  );
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<Array<Appointment | RecordRow>>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAgenda = kind === 'appointments' || kind === 'next';
  useEffect(() => {
    let active = true;
    async function load() {
      let query;
      if (isAgenda) {
        query = client
          .from('clinic_appointments')
          .select(CLIENT_APPOINTMENT_SELECT);
        if (kind === 'next')
          query = query
            .gte('scheduled_start', new Date().toISOString())
            .neq('status', 'cancelled')
            .neq('status', 'no_show');
        if (filter === 'unfinished')
          query = query
            .in('status', ['scheduled', 'confirmed'])
            .lt('scheduled_end', new Date().toISOString());
        else if (filter !== 'all') query = query.eq('status', filter);
        query = query.order('scheduled_start', { ascending: kind === 'next' });
      } else if (kind === 'conversations') {
        query = client
          .from('conversations')
          .select(
            'id,status,unread_count,last_message_at,last_message_text,created_at'
          )
          .order('last_message_at', { ascending: false });
      } else if (kind === 'deals') {
        query = client
          .from('deals')
          .select('id,title,status,value,currency,created_at')
          .eq('status', 'open')
          .order('created_at', { ascending: false });
      } else {
        query = client
          .from('finance_sales')
          .select(
            'id,sale_number,status,total_amount,paid_amount,balance_due,currency,created_at,items:finance_sale_items(name_snapshot)'
          )
          .neq('status', 'voided')
          .neq('status', 'refunded')
          .order('created_at', { ascending: false });
        if (filter === 'due') query = query.gt('balance_due', 0);
        if (filter === 'received') query = query.gt('paid_amount', 0);
      }
      const response = await query
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      if (!active) return;
      if (response.error) throw new Error(response.error.message);
      const data = (response.data ?? []) as unknown as Array<
        Appointment | RecordRow
      >;
      setRows(data.slice(0, PAGE_SIZE));
      setMore(data.length > PAGE_SIZE);
    }
    void load()
      .catch((failure: unknown) => {
        if (active) {
          setRows([]);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Não foi possível carregar os registos.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, kind, accountId, contactId, isAgenda, filter, page, retry]);

  function changeFilter(value: string) {
    setLoading(true);
    setError(null);
    setFilter(value);
    setPage(0);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>{TITLES[kind]}</DialogTitle>
          <DialogDescription>
            {kind === 'appointments'
              ? 'Todo o histórico. Concluídos são sessões realizadas; Por concluir mostra sessões terminadas sem fecho. Cancelamentos e faltas têm filtros próprios.'
              : kind === 'finance'
                ? 'Vendas que compõem os valores do cliente, excluindo as anuladas e reembolsadas. Pagamentos com benefício não representam nova entrada de dinheiro.'
                : 'Registos de todo o histórico que compõem este indicador. Selecione um para abrir os detalhes.'}
          </DialogDescription>
        </DialogHeader>
        {(kind === 'appointments' || kind === 'finance') && (
          <div className="shrink-0 border-b p-3">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Mostrar
              <select
                aria-label="Filtrar registos"
                value={filter}
                onChange={(event) => changeFilter(event.target.value)}
                className="bg-background min-h-10 max-w-full rounded-lg border px-3"
              >
                {kind === 'appointments' ? (
                  <>
                    <option value="all">Todos os atendimentos</option>
                    <option value="completed">Concluídos</option>
                    <option value="unfinished">
                      Por concluir · sessão já terminou
                    </option>
                    <option value="scheduled">Agendados</option>
                    <option value="confirmed">Confirmados</option>
                    <option value="cancelled">Cancelados</option>
                    <option value="no_show">Faltou</option>
                  </>
                ) : (
                  <>
                    <option value="all">Todas as vendas</option>
                    <option value="received">Com valor recebido</option>
                    <option value="due">Com saldo por receber</option>
                  </>
                )}
              </select>
            </label>
          </div>
        )}
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
          aria-busy={loading}
        >
          {loading ? (
            <p role="status" className="text-muted-foreground py-8 text-center">
              A carregar os registos…
            </p>
          ) : error ? (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100"
            >
              <p>Não foi possível carregar os registos: {error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setRetry((value) => value + 1);
                }}
              >
                <RefreshCw /> Tentar novamente
              </Button>
            </div>
          ) : !rows.length ? (
            <p className="text-muted-foreground py-8 text-center">
              Não existem registos neste filtro.
            </p>
          ) : (
            rows.map((item) =>
              isAgenda
                ? renderAppointment(item as Appointment)
                : (() => {
                    const row = item as RecordRow;
                    const href =
                      kind === 'conversations'
                        ? `/inbox?c=${row.id}`
                        : kind === 'deals'
                          ? `/pipelines?deal=${row.id}`
                          : `/finance?tab=sales#sale-${row.id}`;
                    return (
                      <button
                        type="button"
                        key={row.id}
                        onClick={() => onNavigate(href)}
                        className="hover:bg-muted focus-visible:ring-ring flex w-full items-start gap-3 rounded-xl border p-3 text-left focus-visible:ring-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {kind === 'conversations'
                              ? 'Conversa do WhatsApp'
                              : kind === 'deals'
                                ? row.title || 'Negócio'
                                : `Venda #${row.sale_number ?? row.id.slice(0, 8)}`}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {new Intl.DateTimeFormat('pt-PT', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                              timeZone: 'Europe/Lisbon',
                            }).format(
                              new Date(row.last_message_at || row.created_at!)
                            )}
                          </p>
                          {kind === 'finance' && (
                            <p className="mt-2 text-sm break-words">
                              {row.items
                                ?.map((item) => item.name_snapshot)
                                .join(' · ') ||
                                'Venda sem descrição de artigos'}
                            </p>
                          )}
                          {kind === 'conversations' ? (
                            <>
                              <p className="mt-2 text-sm break-words">
                                {row.last_message_text ||
                                  'Sem mensagem de texto'}
                              </p>
                              <Badge variant="secondary" className="mt-2">
                                {Number(row.unread_count || 0)} não lidas
                              </Badge>
                            </>
                          ) : kind === 'deals' ? (
                            <p className="mt-2 font-medium">
                              {formatCurrency(
                                Number(row.value || 0),
                                row.currency || currency
                              )}
                            </p>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="secondary">
                                Total{' '}
                                {formatCurrency(
                                  Number(row.total_amount),
                                  row.currency || currency
                                )}
                              </Badge>
                              <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                                Recebido{' '}
                                {formatCurrency(
                                  Number(row.paid_amount),
                                  row.currency || currency
                                )}
                              </Badge>
                              {Number(row.balance_due) > 0 && (
                                <Badge className="bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                                  Por receber{' '}
                                  {formatCurrency(
                                    Number(row.balance_due),
                                    row.currency || currency
                                  )}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <ArrowUpRight
                          aria-hidden
                          className="mt-1 size-4 shrink-0"
                        />
                      </button>
                    );
                  })()
            )
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3">
          <span className="text-muted-foreground text-xs">
            Página {page + 1}
            {!loading && !error ? ` · ${rows.length} registos` : ''}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={loading || page === 0}
              onClick={() => {
                setLoading(true);
                setError(null);
                setPage((value) => value - 1);
              }}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={loading || !!error || !more}
              onClick={() => {
                setLoading(true);
                setError(null);
                setPage((value) => value + 1);
              }}
            >
              Seguinte
            </Button>
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

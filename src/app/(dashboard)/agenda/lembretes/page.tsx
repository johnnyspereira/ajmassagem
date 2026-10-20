'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { formatAccountEventTime } from '@/lib/timezone';
type Appointment = {
  id: string;
  scheduled_start: string;
  name: string;
  phone: string;
  service_name: string;
  status: string;
  last_schedule_change_type?: string;
  confirmation_status: string;
  confirmation_response_at: string | null;
  reminder_sent_at: string | null;
};
type Delivery = { sent?: boolean; queued?: boolean; error?: string | null };
type Event = {
  id: string;
  entity_id: string;
  created_at: string;
  action: string;
  reason: string;
  metadata:
    | string
    | {
        message_action?: string;
        deliveries?: { whatsapp?: Delivery; email?: Delivery };
      };
};
export default function ReminderHistory() {
  const { account } = useAuth();
  const zone = account?.timezone || 'Europe/Lisbon';
  const [data, setData] = useState<{
    appointments: Appointment[];
    events: Event[];
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/clinic/reminder-history', {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || 'Não foi possível carregar os lembretes.');
      setData(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-primary text-xs tracking-widest uppercase">
            Agenda · Comunicação
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            <BellRing />
            Lembretes e confirmações
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Envio previsto 24 horas antes. Verificação a cada 5 minutos com o
            agendador local ligado.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-xl border px-3 py-2 text-sm" href="/agenda">
            Voltar à agenda
          </Link>
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={busy ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        </div>
      </header>
      <p className="bg-muted/20 rounded-xl border p-4 text-sm">
        CONFIRMAR confirma a sessão. CANCELAR cancela e liberta o horário.
        REAGENDAR inicia o pedido de outro horário; a nova data só é aplicada
        após a escolha do cliente e nova validação de disponibilidade.
        Pagamentos não são reembolsados automaticamente.
      </p>
      {error && (
        <p
          role="alert"
          className="border-destructive rounded-xl border p-4 text-sm"
        >
          {error}
        </p>
      )}
      <input
        aria-label="Pesquisar notificações da agenda"
        placeholder="Pesquisar cliente ou serviço"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="bg-background h-10 w-full rounded-xl border px-3 text-sm"
      />
      <p className="text-muted-foreground text-xs">
        Sessões dos últimos 7 dias e próximos 30 dias · até 500 registos. Aceite
        pelo canal não equivale a leitura pelo cliente.
      </p>
      <div className="space-y-3">
        {data?.appointments
          .filter((item) =>
            `${item.name} ${item.phone} ${item.service_name}`
              .toLowerCase()
              .includes(query.toLowerCase())
          )
          .map((item) => {
            const attempts = data.events
              .filter(
                (event) =>
                  event.entity_id === item.id && event.action === 'message_sent'
              )
              .filter((event) => {
                try {
                  const meta =
                    typeof event.metadata === 'string'
                      ? JSON.parse(event.metadata)
                      : event.metadata;
                  return ['reminder', 'pending_confirmation'].includes(
                    meta?.message_action
                  );
                } catch {
                  return false;
                }
              });
            return (
              <article key={item.id} className="bg-card rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {item.name || item.phone || 'Cliente'}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {item.service_name} ·{' '}
                      {formatAccountEventTime(item.scheduled_start, zone)}
                    </p>
                  </div>
                  <Link
                    className="rounded-lg border px-3 py-2 text-xs"
                    href={`/agenda?appointment=${item.id}`}
                  >
                    Abrir marcação
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="bg-muted rounded-lg px-2 py-1">
                    {item.status === 'cancelled'
                      ? 'Cancelada'
                      : item.status === 'completed'
                        ? 'Concluída'
                        : item.status === 'no_show'
                          ? 'Faltou'
                          : item.last_schedule_change_type === 'rescheduled' &&
                              item.confirmation_status === 'confirmed'
                            ? 'Reagendada e confirmada'
                            : item.confirmation_status === 'confirmed'
                              ? 'Confirmada'
                              : item.confirmation_status === 'declined'
                                ? 'Alteração solicitada'
                                : 'Aguarda confirmação'}
                  </span>
                  <span className="bg-muted rounded-lg px-2 py-1">
                    {item.reminder_sent_at
                      ? `Lembrete processado: ${formatAccountEventTime(item.reminder_sent_at, zone)}`
                      : 'Lembrete ainda não processado'}
                  </span>
                  {item.confirmation_response_at && (
                    <span className="bg-muted rounded-lg px-2 py-1">
                      Resposta:{' '}
                      {formatAccountEventTime(
                        item.confirmation_response_at,
                        zone
                      )}
                    </span>
                  )}
                </div>
                {attempts.slice(0, 3).map((event) => {
                  let meta;
                  try {
                    meta =
                      typeof event.metadata === 'string'
                        ? JSON.parse(event.metadata)
                        : event.metadata;
                  } catch {
                    return null;
                  }
                  return (
                    <div key={event.id} className="mt-3 border-t pt-2 text-xs">
                      <p className="text-muted-foreground">
                        {formatAccountEventTime(event.created_at, zone)} ·{' '}
                        {meta.message_action === 'reminder'
                          ? 'Lembrete da sessão'
                          : 'Pedido de confirmação'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {(['whatsapp', 'email'] as const).map((channel) => {
                          const delivery = meta.deliveries?.[channel];
                          return (
                            <span key={channel}>
                              {channel === 'whatsapp' ? 'WhatsApp' : 'Email'}:{' '}
                              {delivery?.sent
                                ? 'aceite pelo canal'
                                : delivery?.queued
                                  ? 'em fila'
                                  : delivery?.error
                                    ? 'falhou'
                                    : 'sem envio'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </article>
            );
          })}
        {data && !data.appointments.length && (
          <p className="text-muted-foreground p-8 text-center text-sm">
            Nenhuma sessão neste período.
          </p>
        )}
      </div>
    </div>
  );
}

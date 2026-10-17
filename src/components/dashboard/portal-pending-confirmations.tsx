'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCheck, Clock3, Repeat2 } from 'lucide-react';
import type { PortalPendingConfirmationItem } from '@/lib/dashboard/types';
import { AppointmentActions } from './appointment-actions';
import { Skeleton } from './skeleton';
import { Button } from '@/components/ui/button';

export function PortalPendingConfirmationsCard({
  appointments,
  loading,
  error = false,
  onChanged,
}: {
  appointments: PortalPendingConfirmationItem[] | null;
  loading: boolean;
  error?: boolean;
  onChanged: (id: string) => void;
}) {
  const [limit, setLimit] = useState(4);
  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            PORTAL 360
          </p>
          <h2 className="mt-1 text-base font-semibold">Pedidos por resolver</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Confirme reservas ou trate alterações de horário.
          </p>
        </div>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          {loading ? '…' : error ? '—' : (appointments?.length ?? 0)}
        </span>
      </header>
      {loading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : error && !appointments ? (
        <p role="alert" className="p-5 text-sm text-amber-700">
          Não foi possível carregar os pedidos. Atualize o painel ou consulte a
          agenda.
        </p>
      ) : appointments?.length ? (
        <div className="divide-border divide-y">
          {error && (
            <p
              role="status"
              className="bg-amber-500/5 px-5 py-3 text-xs text-amber-700 dark:text-amber-400"
            >
              A última atualização falhou. Estes pedidos podem estar
              desatualizados.
            </p>
          )}
          {appointments.slice(0, limit).map((appointment) => (
            <article key={appointment.id} className="p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={appointment.href}
                    className="font-semibold hover:underline"
                  >
                    {appointment.contactName}
                  </Link>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {appointment.serviceName}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
                  {appointment.kind === 'reschedule' ? (
                    <Repeat2 className="size-4" />
                  ) : (
                    <Clock3 className="size-4" />
                  )}
                </span>
              </div>
              <p className="text-sm font-medium">
                {new Date(appointment.scheduledStart).toLocaleString('pt-PT', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {appointment.professionalName}
                </span>
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {appointment.kind === 'reschedule' && appointment.requestedStart
                  ? `Pede alteração para ${new Date(appointment.requestedStart).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`
                  : 'Aguarda confirmação da equipa'}
              </p>
              <div className="mt-4">
                <AppointmentActions
                  appointment={appointment}
                  onChanged={onChanged}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
          <span className="mb-3 rounded-full bg-emerald-500/10 p-3 text-emerald-600">
            <CheckCheck className="size-6" />
          </span>
          <p className="text-sm font-semibold">
            {error ? 'Atualização indisponível' : 'Tudo tratado'}
          </p>
          <p className="text-muted-foreground mt-1 max-w-60 text-xs">
            {error
              ? 'Não foi possível verificar se existem novos pedidos. Tente atualizar novamente.'
              : 'As reservas confirmadas estão na agenda. Não há pedidos pendentes.'}
          </p>
        </div>
      )}
      <footer className="border-border border-t px-5 py-3">
        {!loading && !error && appointments && appointments.length > limit && (
          <Button
            variant="outline"
            size="sm"
            className="mb-3 w-full"
            onClick={() => setLimit((current) => current + 4)}
          >
            Mostrar mais pedidos ({appointments.length - limit})
          </Button>
        )}
        <Link
          href="/agenda"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
        >
          Consultar todas as marcações <ArrowUpRight className="size-3.5" />
        </Link>
      </footer>
    </section>
  );
}

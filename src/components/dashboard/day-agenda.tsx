'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TodayOperations } from '@/lib/dashboard/types';
import { AppointmentActions } from './appointment-actions';
import { Skeleton } from './skeleton';

const labels: Record<string, string> = {
  scheduled: 'Por confirmar',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Faltou',
};
export function DayAgenda({
  data,
  loading,
  error,
  onChanged,
}: {
  data: TodayOperations | null;
  loading: boolean;
  error: boolean;
  onChanged: (id: string) => void;
}) {
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(6);
  const appointments = (data?.appointments ?? [])
    .filter(
      (item) =>
        (filter === 'all' ||
          (filter === 'pending'
            ? item.status === 'scheduled'
            : ['scheduled', 'confirmed'].includes(item.status))) &&
        `${item.contactName} ${item.serviceName}`
          .toLocaleLowerCase('pt-PT')
          .includes(search.toLocaleLowerCase('pt-PT'))
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledStart).getTime() -
        new Date(b.scheduledStart).getTime()
    );
  return (
    <section className="border-border bg-card overflow-hidden rounded-2xl border">
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Agenda de hoje</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {data
              ? `${data.appointmentsTotal} marcações · ${data.confirmed} confirmadas · ${data.completed} concluídas`
              : 'Os seus atendimentos num só lugar'}
          </p>
        </div>
        <Link
          href="/agenda"
          className="text-primary inline-flex items-center gap-1 text-xs font-semibold"
        >
          Ver agenda <ArrowUpRight className="size-3.5" />
        </Link>
      </header>
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="bg-muted/60 flex gap-1 rounded-lg p-1">
          {[
            ['active', 'Atendimentos'],
            ['pending', 'Por confirmar'],
            ['all', 'Todas'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setLimit(6);
              }}
              aria-pressed={filter === value}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                filter === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-44">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
          <Input
            aria-label="Procurar na agenda de hoje"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(6);
            }}
            placeholder="Procurar cliente…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      {loading ? (
        <div className="space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : error || !data ? (
        <p role="alert" className="p-8 text-sm text-amber-700">
          Não foi possível carregar a agenda. Atualize o painel para tentar
          novamente.
        </p>
      ) : appointments.length ? (
        <div className="divide-border divide-y">
          {appointments.slice(0, limit).map((appointment) => (
            <article key={appointment.id} className="flex gap-4 p-4 sm:p-5">
              <div className="w-14 shrink-0 pt-0.5 text-center">
                <p className="text-lg font-semibold tracking-tight tabular-nums">
                  {new Date(appointment.scheduledStart).toLocaleTimeString(
                    'pt-PT',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {Math.round(
                    (new Date(appointment.scheduledEnd).getTime() -
                      new Date(appointment.scheduledStart).getTime()) /
                      60000
                  )}{' '}
                  min
                </p>
              </div>
              <div className="border-primary/20 min-w-0 flex-1 border-l-2 pl-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={appointment.href}
                    className="hover:text-primary font-semibold"
                  >
                    {appointment.contactName}
                  </Link>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      appointment.status === 'confirmed'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : appointment.status === 'scheduled'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {appointment.status === 'confirmed' ? (
                      <Check className="size-3" />
                    ) : (
                      <Clock3 className="size-3" />
                    )}
                    {labels[appointment.status] ?? appointment.status}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {appointment.serviceName}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {appointment.professionalName}
                  {appointment.roomName ? ` · ${appointment.roomName}` : ''}
                  {appointment.benefit
                    ? ` · ${appointment.benefit === 'pack' ? 'Pack' : appointment.benefit === 'voucher' ? 'Voucher' : 'Indicação'}`
                    : ''}
                </p>
                <div className="mt-3">
                  <AppointmentActions
                    appointment={appointment}
                    onChanged={onChanged}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <CalendarDays className="text-muted-foreground mb-3 size-8" />
          <p className="text-sm font-semibold">
            {search
              ? 'Nenhum resultado'
              : filter === 'pending'
                ? 'Sem marcações por confirmar'
                : 'Agenda em dia'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {search
              ? 'Experimente outro nome ou procedimento.'
              : 'Consulte a agenda para ver outros dias.'}
          </p>
        </div>
      )}
      {!loading && appointments.length > limit && (
        <div className="border-border border-t p-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLimit((current) => current + 6)}
          >
            Mostrar mais {Math.min(6, appointments.length - limit)} marcações
          </Button>
        </div>
      )}
    </section>
  );
}

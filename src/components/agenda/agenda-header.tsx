'use client';
import Link from 'next/link';
import {
  CalendarClock,
  CalendarCheck,
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  History,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface AgendaHeaderProps {
  dateTitle: string;
  date: string;
  onDate: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onCreate: () => void;
  onBlock: () => void;
  onCalendars: () => void;
  onImport: () => void;
  canOperate: boolean;
  loading: boolean;
  refreshTitle: string;
  count: number;
  confirmed: number;
  paid: number;
  receivable: string;
  pendingPayments: number;
  period: 'day' | 'week';
}

export function AgendaHeader(props: AgendaHeaderProps) {
  const metrics = [
    {
      label: 'Marcações',
      value: props.count,
      detail:
        props.period === 'day' ? 'No dia selecionado' : 'Na semana selecionada',
      icon: CalendarClock,
      tone: 'text-primary bg-primary/10',
    },
    {
      label: 'Confirmadas',
      value: props.confirmed,
      detail: 'Prontas para receber',
      icon: CalendarCheck,
      tone: 'text-emerald-600 bg-emerald-500/10',
    },
    {
      label: 'Por receber',
      value: props.receivable,
      detail: `${props.pendingPayments} por liquidar`,
      icon: CircleDollarSign,
      tone: 'text-amber-600 bg-amber-500/10',
    },
    {
      label: 'Pagas',
      value: props.paid,
      detail: 'Marcações com pagamento',
      icon: WalletCards,
      tone: 'text-sky-600 bg-sky-500/10',
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-primary mb-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
            Organização do atendimento
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            O seu tempo, com tudo no lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.canOperate && (
            <>
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                onClick={props.onBlock}
              >
                <Lock className="size-4" />
                Bloquear horário
              </Button>
              <Button className="h-10 rounded-xl px-4" onClick={props.onCreate}>
                <Plus className="size-4" />
                Nova marcação
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mais opções da agenda"
              title="Mais opções"
              className="border-border bg-card hover:bg-muted flex size-10 items-center justify-center rounded-xl border"
            >
              <MoreHorizontal className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
              <DropdownMenuItem render={<Link href="/settings?tab=clinic" />}>
                <Settings2 className="size-4" />
                Configurar clínica
              </DropdownMenuItem>
              {props.canOperate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={props.onCalendars}>
                    <CalendarSync className="size-4" />
                    Calendários externos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={props.onImport}>
                    <History className="size-4" />
                    Importar histórico
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="border-border bg-card rounded-2xl border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">{metric.label}</p>
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-xl',
                  metric.tone
                )}
              >
                <metric.icon className="size-4" />
              </span>
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {metric.value}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {metric.detail}
            </p>
          </div>
        ))}
      </div>
      <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="bg-muted/60 flex items-center rounded-xl p-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Período anterior"
              className="size-8 rounded-lg"
              onClick={props.onPrevious}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              className="h-8 rounded-lg px-3"
              onClick={props.onToday}
            >
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Período seguinte"
              className="size-8 rounded-lg"
              onClick={props.onNext}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h2 className="text-sm font-semibold capitalize sm:text-base">
            {props.dateTitle}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="Escolher data da agenda"
            type="date"
            value={props.date}
            onChange={(event) => {
              if (event.target.value) props.onDate(event.target.value);
            }}
            className="border-border bg-background h-9 w-36 rounded-lg border px-2 text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg"
            aria-label="Atualizar agenda"
            title={props.refreshTitle}
            disabled={props.loading}
            onClick={props.onRefresh}
          >
            <RefreshCw
              className={cn('size-4', props.loading && 'animate-spin')}
            />
          </Button>
        </div>
      </div>
    </div>
  );
}

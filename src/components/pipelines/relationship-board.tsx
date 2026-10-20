'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarPlus,
  Clock3,
  GripVertical,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LEAD_STATUSES,
  type LeadFollowup,
  type LeadStatus,
} from '@/lib/contacts/lead-workflow';
import { leadTimestamp, type LeadRow } from '@/lib/contacts/lead-workspace';
import { formatAccountEventTime } from '@/lib/timezone';

const stages: { id: LeadStatus; color: string; hint: string }[] = [
  { id: 'new', color: '#b89a60', hint: 'Preparar o primeiro passo' },
  { id: 'contacted', color: '#3b8e96', hint: 'Aguardar e dar seguimento' },
  { id: 'interested', color: '#8971b5', hint: 'Combinar serviço e horário' },
  { id: 'scheduled', color: '#249575', hint: 'Acompanhar a próxima sessão' },
  {
    id: 'not_interested',
    color: '#889096',
    hint: 'Respeitar a decisão do cliente',
  },
];
export function RelationshipBoard({
  rows,
  followups,
  canEdit,
  busy,
  onMove,
  onTreat,
  onBook,
  zone,
}: {
  rows: LeadRow[];
  followups: Map<string, LeadFollowup>;
  canEdit: boolean;
  busy: boolean;
  onMove: (id: string, status: LeadStatus) => void;
  onTreat: (id: string) => void;
  onBook: (row: LeadRow) => void;
  zone: string;
}) {
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [over, setOver] = useState<LeadStatus | null>(null);
  return (
    <div
      aria-label="Pipeline de relacionamento"
      className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto p-3 pb-4 sm:p-4 lg:snap-none"
    >
      {stages.map((stage) => {
        const items = rows.filter(
          (row) => (followups.get(row.contact.id)?.status || 'new') === stage.id
        );
        const due = items.filter((row) => {
          const date = followups.get(row.contact.id)?.next_followup_at;
          return date && leadTimestamp(date) <= Date.now();
        }).length;
        return (
          <section
            key={stage.id}
            aria-label={`Etapa ${LEAD_STATUSES[stage.id]}`}
            className={`bg-muted/20 flex max-h-[70dvh] min-h-80 w-[min(82vw,310px)] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border lg:w-[280px] ${over === stage.id ? 'ring-primary ring-2' : ''}`}
            onDragOver={(event) => {
              if (canEdit && !busy) {
                event.preventDefault();
                setOver(stage.id);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              if (!canEdit || busy) return;
              const id = event.dataTransfer.getData('application/x-jp-lead');
              if (rows.some((row) => row.contact.id === id))
                onMove(id, stage.id);
            }}
          >
            <div
              className="bg-card shrink-0 border-b px-4 py-4"
              style={{ borderTop: `3px solid ${stage.color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {LEAD_STATUSES[stage.id]}
                </h3>
                <span className="bg-muted rounded-full px-2 py-0.5 text-xs tabular-nums">
                  {items.length}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{stage.hint}</p>
              {due > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {due} seguimento(s) por fazer
                </p>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
              {items.slice(0, limits[stage.id] || 20).map((row) => {
                const item = followups.get(row.contact.id);
                const overdue =
                  item?.next_followup_at &&
                  leadTimestamp(item.next_followup_at) <= Date.now();
                return (
                  <article
                    key={row.contact.id}
                    draggable={canEdit && !busy}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        'application/x-jp-lead',
                        row.contact.id
                      );
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    aria-label={`Acompanhamento de ${row.contact.name || row.contact.phone}`}
                    className="bg-card space-y-3 rounded-xl border p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                        {(row.contact.name || '?')[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/contacts/${row.contact.id}`}
                          className="block truncate text-sm font-semibold hover:underline"
                        >
                          {row.contact.name || row.contact.phone}
                        </Link>
                        <p className="text-muted-foreground text-[10px]">
                          Ref. {row.contact.client_reference || '—'}
                        </p>
                      </div>
                      {canEdit && (
                        <GripVertical
                          aria-hidden
                          className="text-muted-foreground size-4 shrink-0"
                        />
                      )}
                    </div>
                    <div className="text-muted-foreground space-y-1 text-xs">
                      <p>
                        {row.lastSession
                          ? `Última sessão: ${new Intl.DateTimeFormat('pt-PT', { timeZone: zone, dateStyle: 'short' }).format(leadTimestamp(row.lastSession))} · ${row.daysSinceSession} dias`
                          : 'Ainda sem sessão concluída'}
                      </p>
                      <p>
                        {row.benefits} benefício(s) disponível(is)
                        {row.expiring !== undefined
                          ? ` · validade em ${row.expiring} dias`
                          : ''}
                      </p>
                      <p>
                        {row.nextAppointment
                          ? `Próxima sessão: ${formatAccountEventTime(row.nextAppointment, zone)}`
                          : 'Sem marcação futura'}
                      </p>
                    </div>
                    {item?.next_followup_at && (
                      <p
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] ${overdue ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}
                      >
                        <Clock3 className="size-3 shrink-0" />
                        {overdue
                          ? 'Seguimento pendente'
                          : 'Próximo contacto'} ·{' '}
                        {formatAccountEventTime(item.next_followup_at, zone)}
                      </p>
                    )}
                    {item?.notes && (
                      <p className="text-muted-foreground line-clamp-2 border-l-2 pl-2 text-xs break-words">
                        {item.notes}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onTreat(row.contact.id)}
                      >
                        <MessageCircle className="size-3" />
                        Tratar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit || busy}
                        onClick={() => onBook(row)}
                      >
                        <CalendarPlus className="size-3" />
                        Agendar
                      </Button>
                    </div>
                    <label className="text-muted-foreground block text-[10px]">
                      Mover para
                      <select
                        aria-label={`Etapa de ${row.contact.name || row.contact.phone}`}
                        className="bg-background text-foreground mt-1 h-8 w-full rounded-lg border px-2 text-xs"
                        disabled={!canEdit || busy}
                        value={item?.status || 'new'}
                        onChange={(event) =>
                          onMove(
                            row.contact.id,
                            event.target.value as LeadStatus
                          )
                        }
                      >
                        {stages.map((next) => (
                          <option key={next.id} value={next.id}>
                            {LEAD_STATUSES[next.id]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                );
              })}
              {!items.length && (
                <div className="text-muted-foreground flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-xs">
                  <UserRound className="size-5" />
                  <p>Nenhum contacto nesta etapa.</p>
                </div>
              )}
              {items.length > (limits[stage.id] || 20) && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() =>
                    setLimits((previous) => ({
                      ...previous,
                      [stage.id]: (previous[stage.id] || 20) + 20,
                    }))
                  }
                >
                  Ver mais contactos ({items.length - (limits[stage.id] || 20)})
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { accountDateInput } from '@/lib/timezone';
import type { HistoricalCandidate } from '@/lib/dashboard/historical-appointments';

export function HistoricalAppointmentsDialog({
  search,
  onComplete,
}: {
  search: string;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState(() =>
    accountDateInput(new Date(), 'Europe/Lisbon')
  );
  const [rows, setRows] = useState<HistoricalCandidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [reason, setReason] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [success, setSuccess] = useState('');
  const eligible = rows?.filter((r) => r.plan !== 'excluded') || [];
  async function perform(commit = false) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/attention/regularize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: commit ? 'commit' : 'preview',
          before,
          search,
          reason,
          authorized,
          selected: rows
            ?.filter((r) => selected.includes(r.id))
            .map((r) => ({ id: r.id, revision: r.revision })),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error || 'Não foi possível regularizar. Tente novamente.'
        );
      if (commit) {
        setSuccess(
          `${data.completed} atendimento(s) concluído(s), com ${data.historical} registo(s) de faturação anterior. Caixa e recebimentos mantidos. Nenhuma mensagem enviada ao cliente.`
        );
        setRows(null);
        setSelected([]);
        onComplete();
      } else {
        setRows(
          data.candidates.sort(
            (a: HistoricalCandidate, b: HistoricalCandidate) =>
              b.start.localeCompare(a.start)
          )
        );
        setSelected([]);
        setAuthorized(false);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Falha ao consultar. Tente novamente.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setSuccess('');
          setRows(null);
          setSelected([]);
          setError('');
          setAuthorized(false);
        }}
      >
        Regularizar atendimentos antigos
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton={!busy}
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-12">
            <DialogTitle>Concluir histórico sem movimentar o caixa</DialogTitle>
            <DialogDescription>
              Exclusivo do proprietário. Registe sessões efetivamente realizadas
              e faturadas anteriormente. Não emite fatura fiscal nem cobra o
              cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5">
            {success ? (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
              >
                {success}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-sm">
                    Sessões terminadas antes de
                    <Input
                      className="min-h-11 text-base sm:text-sm"
                      type="date"
                      value={before}
                      max={accountDateInput(new Date(), 'Europe/Lisbon')}
                      disabled={busy}
                      onChange={(e) => {
                        setBefore(e.target.value);
                        setRows(null);
                        setSelected([]);
                        setAuthorized(false);
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || !before}
                    onClick={() => void perform()}
                  >
                    {busy ? 'A consultar…' : 'Consultar atendimentos'}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Data em Lisboa, às 00:00. O dia selecionado fica excluído.{' '}
                  {search
                    ? `Pesquisa aplicada: ${search}.`
                    : 'Todos os clientes.'}{' '}
                  Até 200 atendimentos por lote, incluindo todas as páginas da
                  fila.
                </p>
                {rows && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-y py-3">
                      <label className="flex min-h-10 items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          disabled={busy || !eligible.length}
                          checked={
                            eligible.length > 0 &&
                            selected.length === eligible.length
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked ? eligible.map((r) => r.id) : []
                            )
                          }
                        />
                        Selecionar todos os elegíveis ({eligible.length})
                      </label>
                      <span className="text-muted-foreground text-xs">
                        {selected.length} selecionado(s) ·{' '}
                        {rows.length - eligible.length} para revisão individual
                      </span>
                    </div>
                    {!rows.length && (
                      <p>Nenhum atendimento pendente neste período.</p>
                    )}
                    <ul className="divide-y">
                      {rows.map((row) => (
                        <li key={row.id} className="py-3">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="accent-primary mt-1 size-4 shrink-0"
                              aria-label={`Selecionar ${row.name}`}
                              disabled={busy || row.plan === 'excluded'}
                              checked={selected.includes(row.id)}
                              onChange={(e) =>
                                setSelected((v) =>
                                  e.target.checked
                                    ? [...v, row.id]
                                    : v.filter((id) => id !== row.id)
                                )
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <strong className="block break-words">
                                {row.name}
                              </strong>
                              <span className="block">
                                {row.service} ·{' '}
                                {new Date(row.start).toLocaleString('pt-PT', {
                                  timeZone: 'Europe/Lisbon',
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                              <span
                                className={`mt-1 block text-xs ${row.plan === 'excluded' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}
                              >
                                {row.detail}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm tabular-nums">
                              {new Intl.NumberFormat('pt-PT', {
                                style: 'currency',
                                currency: row.currency,
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(row.amount)}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {!!eligible.length && (
                      <div className="space-y-3 border-t pt-4">
                        <label className="grid gap-1">
                          Motivo da regularização
                          <Input
                            className="min-h-11 text-base sm:text-sm"
                            value={reason}
                            maxLength={500}
                            disabled={busy}
                            placeholder="Ex.: sessões antigas faturadas antes da migração"
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <label className="bg-muted flex items-start gap-3 rounded-lg p-3 text-sm">
                          <input
                            type="checkbox"
                            className="accent-primary mt-1 size-4 shrink-0"
                            disabled={busy}
                            checked={authorized}
                            onChange={(e) => setAuthorized(e.target.checked)}
                          />
                          <span>
                            Confirmo que os atendimentos selecionados foram
                            realizados. Autorizo registar os casos sem venda
                            como faturação anterior já liquidada fora do CRM,
                            sem nova entrada de caixa. Os pagamentos e
                            benefícios já utilizados mantêm-se.
                          </span>
                        </label>
                        <p className="text-muted-foreground text-xs">
                          Os links de anamnese por preencher serão cancelados.
                          Respostas enviadas serão preservadas. Esta ação fica
                          registada com o seu utilizador e motivo.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {error && (
              <p
                role="alert"
                className="bg-destructive/10 text-destructive rounded-lg p-3"
              >
                {error}
              </p>
            )}
          </div>
          <div className="bg-muted/40 flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">
            <Button
              className="min-h-11"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Fechar
            </Button>
            {!success && (
              <Button
                className="min-h-11"
                disabled={
                  busy ||
                  !selected.length ||
                  !authorized ||
                  reason.trim().length < 5
                }
                onClick={() => void perform(true)}
              >
                {busy
                  ? 'A guardar…'
                  : `Concluir ${selected.length || ''} sem caixa`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

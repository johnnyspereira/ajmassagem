'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, MessageCircle, Save, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import {
  accountDateInput,
  accountTimeInput,
  accountDateTimeToUtc,
  formatAccountEventTime,
} from '@/lib/timezone';
import { leadTimestamp, type LeadRow } from '@/lib/contacts/lead-workspace';
import {
  LEAD_MESSAGES,
  LEAD_STATUSES,
  renderLeadMessage,
  suggestedLeadMessage,
  type LeadMessageKind,
  type LeadFollowup,
  type LeadStatus,
  type LeadWorkflowSettings,
  type LeadActivity,
} from '@/lib/contacts/lead-workflow';
import { storeLeadInboxDraft } from '@/lib/contacts/lead-inbox-draft';

export function LeadTreatmentDialog({
  row,
  item,
  settings,
  onSaved,
  onClose,
}: {
  row: LeadRow;
  item?: LeadFollowup;
  settings: LeadWorkflowSettings;
  onSaved: (item: LeadFollowup) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { accountId, account, canSendMessages } = useAuth();
  const zone = account?.timezone || 'Europe/Lisbon';
  const company = account?.name || 'JP Massagem';
  const [kind, setKind] = useState<LeadMessageKind>(() =>
    suggestedLeadMessage(row, item)
  );
  const [text, setText] = useState(() =>
    renderLeadMessage(
      settings.templates[suggestedLeadMessage(row, item)],
      row,
      company,
      zone
    )
  );
  const [status, setStatus] = useState<LeadStatus>(item?.status || 'new');
  const [notes, setNotes] = useState(item?.notes || '');
  const [due, setDue] = useState(() => {
    const date = item?.next_followup_at
      ? new Date(leadTimestamp(item.next_followup_at))
      : new Date(Date.now() + settings.followupDays * 86400000);
    return `${accountDateInput(date, zone)}T${accountTimeInput(date, zone)}`;
  });
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/leads/workflow?contactId=${encodeURIComponent(row.contact.id)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.activities))
          throw new Error(
            'Não foi possível carregar o histórico de acompanhamento.'
          );
        if (!cancelled) setActivities(result.activities);
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(error.message);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.contact.id]);
  function nextContactDate() {
    let nextFollowupAt: string | null = null;
    if (due && !['scheduled', 'not_interested'].includes(status)) {
      const [date, time] = due.split('T');
      const instant = accountDateTimeToUtc(date, time, zone);
      if (
        !Number.isFinite(instant.getTime()) ||
        accountDateInput(instant, zone) !== date ||
        accountTimeInput(instant, zone) !== time
      )
        throw new Error(
          'Escolha uma data e hora válidas para o próximo contacto.'
        );
      nextFollowupAt = instant.toISOString();
    }
    return nextFollowupAt;
  }
  async function save(contacted: boolean) {
    if (lock.current || !canSendMessages) return;
    let nextFollowupAt: string | null;
    try {
      nextFollowupAt = nextContactDate();
    } catch (error) {
      return toast.error((error as Error).message);
    }
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/leads/workflow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: row.contact.id,
          status: contacted && status === 'new' ? 'contacted' : status,
          nextFollowupAt,
          notes,
          contacted,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.item)
        throw new Error(
          result.error || 'Não foi possível guardar o acompanhamento.'
        );
      onSaved(result.item);
      toast.success(
        contacted
          ? 'Abordagem registada e próximo passo guardado.'
          : 'Acompanhamento guardado.'
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao guardar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function openInbox() {
    if (lock.current || !canSendMessages || !accountId || !text.trim()) return;
    if (text.length > 4000)
      return toast.error('A mensagem deve ter até 4.000 caracteres.');
    let nextFollowupAt: string | null;
    try {
      nextFollowupAt = nextContactDate();
    } catch (error) {
      return toast.error((error as Error).message);
    }
    lock.current = true;
    setBusy(true);
    try {
      const saved = await fetch('/api/leads/workflow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: row.contact.id,
          status,
          nextFollowupAt,
          notes,
          contacted: false,
        }),
      });
      const savedResult = await saved.json();
      if (!saved.ok || !savedResult.item)
        throw new Error(
          savedResult.error ||
            'Não foi possível guardar o próximo passo. O rascunho não foi aberto.'
        );
      onSaved(savedResult.item);
      const response = await fetch('/api/leads/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare-chat',
          contactId: row.contact.id,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.conversationId)
        throw new Error(
          result.error || 'Não foi possível preparar a conversa.'
        );
      storeLeadInboxDraft(
        sessionStorage,
        accountId,
        result.conversationId,
        text
      );
      router.push(`/inbox?c=${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível abrir o rascunho.'
      );
      lock.current = false;
      setBusy(false);
    }
  }
  const selectClass =
    'border-input bg-background h-10 w-full min-w-0 rounded-lg border px-3 text-sm';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Tratar lead · {row.contact.name || row.contact.phone}
          </DialogTitle>
          <DialogDescription>
            Prepare a abordagem, registe o resultado e defina o próximo passo.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/40 grid gap-3 rounded-xl p-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Última sessão</p>
            <p className="mt-1 font-medium">
              {row.lastSession
                ? `${new Intl.DateTimeFormat('pt-PT', { timeZone: zone, dateStyle: 'medium' }).format(leadTimestamp(row.lastSession))} · ${row.daysSinceSession} dias`
                : 'Sem sessão concluída'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Benefícios disponíveis</p>
            <p className="mt-1 font-medium">
              {row.benefits}
              {row.expiring !== undefined
                ? ` · validade em ${row.expiring} dias`
                : ''}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Última abordagem registada</p>
            <p className="mt-1 font-medium">
              {item?.last_contacted_at
                ? formatAccountEventTime(
                    new Date(leadTimestamp(item.last_contacted_at)),
                    zone
                  )
                : 'Ainda não registada'}
            </p>
          </div>
        </div>
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <section
            className="min-w-0 space-y-3"
            aria-label="Mensagem de abordagem"
          >
            <h3 className="text-sm font-semibold">1. Preparar mensagem</h3>
            <Label htmlFor="lead-message-kind">Mensagem pronta</Label>
            <select
              id="lead-message-kind"
              className={selectClass}
              value={kind}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value as LeadMessageKind;
                setKind(next);
                setText(
                  renderLeadMessage(
                    settings.templates[next],
                    row,
                    company,
                    zone
                  )
                );
              }}
            >
              {(Object.keys(LEAD_MESSAGES) as LeadMessageKind[]).map((key) => (
                <option
                  key={key}
                  value={key}
                  disabled={key === 'benefit' && row.expiring === undefined}
                >
                  {LEAD_MESSAGES[key]}
                </option>
              ))}
            </select>
            <Label htmlFor="lead-message-text">
              Texto para rever e personalizar
            </Label>
            <Textarea
              id="lead-message-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              rows={8}
              disabled={busy}
              className="min-h-44 resize-y"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!text.trim() || busy}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success('Mensagem copiada.'))
                    .catch(() =>
                      toast.error(
                        'Não foi possível copiar. Selecione o texto e copie manualmente.'
                      )
                    );
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <Button
                size="sm"
                disabled={!canSendMessages || !text.trim() || busy}
                onClick={() => void openInbox()}
              >
                <MessageCircle className="size-4" /> Abrir Inbox com texto
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              O próximo passo fica guardado e o texto abre como rascunho no
              Inbox. Abrir o rascunho não regista uma abordagem efetuada.
            </p>
          </section>
          <section
            className="min-w-0 space-y-3"
            aria-label="Resultado e próximo passo"
          >
            <h3 className="text-sm font-semibold">
              2. Registar acompanhamento
            </h3>
            <Label htmlFor="lead-status">Situação do lead</Label>
            <select
              id="lead-status"
              className={selectClass}
              disabled={!canSendMessages || busy}
              value={status}
              onChange={(event) => setStatus(event.target.value as LeadStatus)}
            >
              {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((key) => (
                <option key={key} value={key}>
                  {LEAD_STATUSES[key]}
                </option>
              ))}
            </select>
            <Label htmlFor="lead-next-contact">Próximo contacto ({zone})</Label>
            <Input
              id="lead-next-contact"
              type="datetime-local"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              disabled={
                !canSendMessages ||
                busy ||
                ['scheduled', 'not_interested'].includes(status)
              }
            />
            <Label htmlFor="lead-followup-notes">
              Notas e resultado da abordagem
            </Label>
            <Textarea
              id="lead-followup-notes"
              rows={4}
              value={notes}
              maxLength={3000}
              disabled={!canSendMessages || busy}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="O que foi combinado? Qual é o próximo passo?"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canSendMessages || busy}
                onClick={() => void save(false)}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}{' '}
                Guardar
              </Button>
              <Button
                size="sm"
                disabled={!canSendMessages || busy}
                onClick={() => void save(true)}
              >
                <CheckCheck className="size-4" /> Registar abordagem
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Use Registar abordagem depois de falar com o cliente. Agendado e
              Sem interesse retiram o contacto da fila de seguimentos pendentes.
            </p>
          </section>
        </div>
        <section
          className="border-t pt-4"
          aria-label="Histórico de acompanhamento"
        >
          <h3 className="mb-3 text-sm font-semibold">
            Histórico de acompanhamento
          </h3>
          {historyLoading ? (
            <p role="status" className="text-muted-foreground text-xs">
              A carregar histórico...
            </p>
          ) : historyError ? (
            <p role="alert" className="text-destructive text-xs">
              {historyError}
            </p>
          ) : activities.length ? (
            <ol className="max-h-48 space-y-2 overflow-y-auto">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="bg-muted/40 rounded-lg p-3 text-xs"
                >
                  <p className="font-medium">
                    {activity.contacted
                      ? 'Abordagem registada'
                      : 'Acompanhamento atualizado'}{' '}
                    · {LEAD_STATUSES[activity.status]}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {formatAccountEventTime(
                      new Date(leadTimestamp(activity.created_at)),
                      zone
                    )}
                    {activity.next_followup_at
                      ? ` · Próximo: ${formatAccountEventTime(new Date(leadTimestamp(activity.next_followup_at)), zone)}`
                      : ''}
                  </p>
                  {activity.notes && (
                    <p className="mt-2 break-words whitespace-pre-wrap">
                      {activity.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-xs">
              Ainda não há abordagens registadas para este contacto.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

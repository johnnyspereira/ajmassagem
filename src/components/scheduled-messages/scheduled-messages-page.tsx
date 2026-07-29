'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { ContactSearchSelect } from '@/components/contacts/contact-search-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';

type ScheduledMessage = {
  id: string;
  account_id: string;
  user_id: string | null;
  contact_id: string;
  conversation_id: string | null;
  content_text: string;
  scheduled_at: string;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  contact?: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null;
};

const STATUS_LABELS: Record<ScheduledMessage['status'], string> = {
  scheduled: 'Agendada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const STATUS_BADGES: Record<ScheduledMessage['status'], string> = {
  scheduled: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  sending: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  sent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-400',
  cancelled: 'border-muted bg-muted text-muted-foreground',
};

function datetimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function contactLabel(contact: ScheduledMessage['contact']) {
  if (!contact) return 'Cliente';
  return contact.name?.trim() || contact.phone || 'Cliente sem nome';
}

export function ScheduledMessagesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const canSend = useCan('send-messages');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState('');
  const [contentText, setContentText] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() =>
    datetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))
  );

  const selectedContact = contacts.find((contact) => contact.id === contactId);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [contactsResult, messagesResult] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('name', { ascending: true }),
      supabase
        .from('scheduled_whatsapp_messages')
        .select(
          '*, contact:contacts(id, name, phone, email)'
        )
        .eq('account_id', accountId)
        .order('scheduled_at', { ascending: true }),
    ]);

    if (contactsResult.error) {
      toast.error(`Não foi possível carregar clientes: ${contactsResult.error.message}`);
    } else {
      setContacts((contactsResult.data ?? []) as Contact[]);
    }

    if (messagesResult.error) {
      toast.error(
        `Não foi possível carregar mensagens: ${messagesResult.error.message}`
      );
    } else {
      setMessages((messagesResult.data ?? []) as ScheduledMessage[]);
    }
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function createScheduledMessage() {
    if (!accountId || !user?.id || !canSend) return;
    if (!contactId) return toast.error('Selecione o cliente.');
    if (!contentText.trim()) return toast.error('Escreva a mensagem.');

    const targetDate = new Date(scheduledAt);
    if (Number.isNaN(targetDate.getTime())) {
      return toast.error('Informe uma data/hora válida.');
    }
    if (targetDate.getTime() <= Date.now()) {
      return toast.error('Escolha uma data/hora no futuro.');
    }

    setSaving(true);
    const { error } = await supabase.from('scheduled_whatsapp_messages').insert({
      account_id: accountId,
      user_id: user.id,
      contact_id: contactId,
      content_text: contentText.trim(),
      scheduled_at: targetDate.toISOString(),
      status: 'scheduled',
    });
    setSaving(false);

    if (error) return toast.error(error.message);

    toast.success('Mensagem agendada.');
    setContentText('');
    setContactId('');
    setScheduledAt(datetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    await loadData();
  }

  async function cancelMessage(message: ScheduledMessage) {
    if (!canSend || message.status !== 'scheduled') return;
    const { error } = await supabase
      .from('scheduled_whatsapp_messages')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', message.id)
      .eq('account_id', accountId);

    if (error) return toast.error(error.message);
    toast.success('Mensagem cancelada.');
    await loadData();
  }

  const nextMessages = messages.filter((message) =>
    ['scheduled', 'sending'].includes(message.status)
  );
  const history = messages.filter(
    (message) => !['scheduled', 'sending'].includes(message.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
            <CalendarClock className="text-primary size-6" />
            Mensagens agendadas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Programe follow-ups, lembretes e mensagens de retorno para clientes.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Agendar nova mensagem</CardTitle>
            <CardDescription>
              Escolha o cliente, escreva o texto e defina quando enviar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Cliente
              </label>
              <ContactSearchSelect
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                allowEmpty={false}
                placeholder="Buscar cliente"
                emptyLabel="Nenhum cliente encontrado."
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Data/hora de envio
              </label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={datetimeLocalValue()}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={!canSend || saving}
              />
            </div>

            <div>
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Mensagem
              </label>
              <Textarea
                value={contentText}
                onChange={(event) => setContentText(event.target.value)}
                placeholder={
                  selectedContact
                    ? `Olá ${selectedContact.name || 'tudo bem'}, ...`
                    : 'Escreva a mensagem que será enviada pelo WhatsApp'
                }
                rows={7}
                disabled={!canSend || saving}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Primeira versão: envio de texto. Templates e mídia vêm na
                próxima camada.
              </p>
            </div>

            <Button
              onClick={createScheduledMessage}
              disabled={
                saving ||
                !canSend ||
                !contactId ||
                !contentText.trim() ||
                !scheduledAt
              }
              className="w-full"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              Agendar mensagem
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <MessageList
            title="Próximas mensagens"
            description="Mensagens ainda aguardando o horário de envio."
            messages={nextMessages}
            loading={loading}
            empty="Nenhuma mensagem futura agendada."
            onCancel={cancelMessage}
          />
          <MessageList
            title="Histórico"
            description="Mensagens enviadas, canceladas ou com falha."
            messages={history}
            loading={loading}
            empty="Ainda não há histórico."
            onCancel={cancelMessage}
          />
        </div>
      </div>
    </div>
  );
}

function MessageList({
  title,
  description,
  messages,
  loading,
  empty,
  onCancel,
}: {
  title: string;
  description: string;
  messages: ScheduledMessage[];
  loading: boolean;
  empty: string;
  onCancel: (message: ScheduledMessage) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="border-border bg-muted/20 flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <MessageSquareText className="text-muted-foreground mb-2 size-7" />
            <p className="text-muted-foreground text-sm">{empty}</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {contactLabel(message.contact)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(message.scheduled_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGES[message.status]}`}
                  >
                    {message.status === 'sent' ? (
                      <CheckCircle2 className="size-3" />
                    ) : message.status === 'failed' ? (
                      <XCircle className="size-3" />
                    ) : null}
                    {STATUS_LABELS[message.status]}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-wrap">
                  {message.content_text}
                </p>
                {message.last_error ? (
                  <Badge variant="destructive" className="h-auto whitespace-normal">
                    {message.last_error}
                  </Badge>
                ) : null}
                {message.status === 'scheduled' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(message)}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

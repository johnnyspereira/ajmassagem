'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Gift,
  Loader2,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContactForm } from '@/components/contacts/contact-form';
import { InboxBookingDialog } from '@/components/inbox/booking-dialog';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  buildLeadRows,
  readLeadPages,
  filterLeadRows,
  leadTimestamp,
  type LeadFilter,
  type LeadSort,
  type LeadHistory,
  type LeadRecency,
  type LeadVoucher,
  type LeadPack,
  type LeadAppointment,
  type LeadRow,
} from '@/lib/contacts/lead-workspace';
import type { BenefitReservation } from '@/lib/inbox/available-benefits';
import type { Contact } from '@/types';
import styles from './leads-workspace.module.css';

const PAGE_SIZE = 30;
const labels: Record<LeadFilter, string> = {
  all: 'Todos',
  expiring: 'Prazo a terminar',
  no_appointment: 'Por agendar',
  new: 'Novos',
  upcoming: 'Com marcação',
  marketing_ready: 'Marketing autorizado',
};
const segments: {
  id: LeadFilter;
  label: string;
  icon: typeof Users;
  hint: string;
}[] = [
  {
    id: 'all',
    label: 'Contactos',
    icon: Users,
    hint: 'Base de relacionamento',
  },
  {
    id: 'expiring',
    label: 'Prazo a terminar',
    icon: Gift,
    hint: 'Benefício em 30 dias · por agendar',
  },
  {
    id: 'no_appointment',
    label: 'Por agendar',
    icon: CalendarPlus,
    hint: 'Sem marcação futura',
  },
  {
    id: 'new',
    label: 'Novos contactos',
    icon: Sparkles,
    hint: 'Criados nos últimos 30 dias',
  },
];
type Snapshot = {
  contacts: Contact[];
  vouchers: LeadVoucher[];
  packs: LeadPack[];
  appointments: LeadAppointment[];
  reservations: BenefitReservation[];
  history: LeadHistory[];
  at: number;
  accountId: string;
  limited: boolean;
};

export function LeadsWorkspacePage() {
  const router = useRouter();
  const { accountId, account, canSendMessages } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [sort, setSort] = useState<LeadSort>('priority');
  const [recency, setRecency] = useState<LeadRecency>('all');
  const [gender, setGender] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newContact, setNewContact] = useState(false);
  const [booking, setBooking] = useState<Contact | null>(null);
  const [openingChat, setOpeningChat] = useState<string | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!accountId) return;
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const db = createClient();
      const now = Date.now();
      const results = await Promise.all([
        readLeadPages(
          () =>
            db
              .from('contacts')
              .select('*')
              .eq('account_id', accountId)
              .order('created_at', { ascending: false })
              .order('id'),
          2001,
          () => id === request.current
        ),
        readLeadPages(
          () =>
            db
              .from('finance_vouchers')
              .select(
                'id,owner_contact_id,status,expires_at,remaining_uses,current_balance,voucher_type'
              )
              .eq('account_id', accountId)
              .eq('status', 'active')
              .order('id'),
          5001,
          () => id === request.current
        ),
        readLeadPages(
          () =>
            db
              .from('finance_client_packs')
              .select(
                'id,contact_id,status,expires_at,balances:finance_client_pack_balances(id,remaining_sessions)'
              )
              .eq('account_id', accountId)
              .eq('status', 'active')
              .order('id'),
          5001,
          () => id === request.current
        ),
        readLeadPages(
          () =>
            db
              .from('clinic_appointments')
              .select('contact_id,scheduled_start,status')
              .eq('account_id', accountId)
              .in('status', ['scheduled', 'confirmed'])
              .gte('scheduled_start', new Date(now).toISOString())
              .order('scheduled_start')
              .order('id'),
          5001,
          () => id === request.current
        ),
        readLeadPages(
          () =>
            db
              .from('finance_appointment_benefits')
              .select(
                'voucher_id,client_pack_balance_id,reserved_amount,reserved_sessions,status'
              )
              .eq('account_id', accountId)
              .eq('status', 'reserved')
              .order('id'),
          5001,
          () => id === request.current
        ),
      ]);
      if (id !== request.current) return;
      if (results.slice(1).some((result) => (result.data || []).length > 5000))
        throw new Error(
          'A base de benefícios ou marcações excede o limite desta vista. Consulte os detalhes no Cliente 360.'
        );
      const contactIds = (results[0].data || [])
        .slice(0, 2000)
        .map((item) => (item as Contact).id);
      let history: LeadHistory[] = [];
      if (contactIds.length) {
        const response = await fetch('/api/leads/session-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds }),
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data))
          throw new Error(
            'Não foi possível carregar o histórico de sessões. Tente novamente.'
          );
        history = result.data;
      }
      if (id !== request.current) return;
      setSnapshot({
        history,
        contacts: (results[0].data || []).slice(0, 2000) as Contact[],
        vouchers: (results[1].data || []) as LeadVoucher[],
        packs: (results[2].data || []) as LeadPack[],
        appointments: (results[3].data || []) as LeadAppointment[],
        reservations: (results[4].data || []) as BenefitReservation[],
        at: now,
        accountId,
        limited: (results[0].data || []).length > 2000,
      });
    } catch (cause) {
      if (id === request.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os leads.'
        );
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [accountId]);
  const invalidateRequest = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => {
    setSelected(new Set());
    void load();
    return invalidateRequest;
  }, [load, invalidateRequest]);
  const current = snapshot?.accountId === accountId ? snapshot : null;
  const rows = useMemo(
    () =>
      current
        ? buildLeadRows(
            current.contacts,
            current.vouchers,
            current.packs,
            current.appointments,
            current.reservations,
            current.at,
            current.history,
            account?.timezone || 'Europe/Lisbon'
          )
        : [],
    [current, account?.timezone]
  );
  const visible = useMemo(
    () => filterLeadRows(rows, filter, query, gender, sort, recency),
    [rows, filter, query, gender, sort, recency]
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(labels) as LeadFilter[]).map((key) => [
          key,
          filterLeadRows(rows, key, '', 'all', 'priority').length,
        ])
      ),
    [rows]
  );
  const lastPage = Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1);
  const activePage = Math.min(page, lastPage);
  const pageRows = visible.slice(
    activePage * PAGE_SIZE,
    (activePage + 1) * PAGE_SIZE
  );
  const allPage =
    pageRows.length > 0 &&
    pageRows.every((row) => selected.has(row.contact.id));
  const somePage = pageRows.some((row) => selected.has(row.contact.id));
  const selectedRows = rows.filter((row) => selected.has(row.contact.id));
  const eligible = selectedRows.filter((row) => row.ready);
  function chooseFilter(next: LeadFilter) {
    setFilter(next);
    setPage(0);
  }
  function toggle(id: string, value: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function togglePage(value: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      pageRows.forEach((row) =>
        value ? next.add(row.contact.id) : next.delete(row.contact.id)
      );
      return next;
    });
  }
  function beginBroadcast() {
    if (!canSendMessages || !eligible.length || loading || error) return;
    try {
      sessionStorage.setItem(
        'broadcast:selected-contact-ids',
        JSON.stringify(eligible.map((row) => row.contact.id))
      );
      router.push('/broadcasts/new?source=leads');
    } catch {
      toast.error(
        'Não foi possível preparar a campanha. Verifique o armazenamento do navegador.'
      );
    }
  }
  async function openChat(contact: Contact) {
    if (openingChat || !accountId) return;
    setOpeningChat(contact.id);
    try {
      const { data, error } = await createClient()
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contact.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data?.id) router.push(`/inbox?c=${encodeURIComponent(data.id)}`);
      else {
        toast.info(
          'Este contacto ainda não tem conversa. Abra o Inbox no Cliente 360 para iniciar.'
        );
        router.push(`/contacts/${contact.id}`);
      }
    } catch {
      toast.error('Não foi possível abrir a conversa. Tente novamente.');
    } finally {
      setOpeningChat(null);
    }
  }
  const clear = () => {
    setRecency('all');
    setQuery('');
    setGender('all');
    chooseFilter('all');
  };
  const hasFilters =
    filter !== 'all' || query !== '' || gender !== 'all' || recency !== 'all';
  return (
    <div className={cn(styles.root, 'space-y-5')}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-primary mb-1 text-[10px] font-semibold tracking-[.16em] uppercase">
            Relacionamento e crescimento
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Saiba quem acompanhar e transforme interesse em marcações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="h-10 rounded-xl"
            disabled={!canSendMessages}
            onClick={() => setNewContact(true)}
          >
            <Plus className="size-4" /> Novo contacto
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mais opções dos leads"
              className="border-border bg-card hover:bg-muted flex size-10 items-center justify-center rounded-xl border"
            >
              <MoreHorizontal className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={loading} onClick={() => void load()}>
                <RefreshCw /> Atualizar dados
              </DropdownMenuItem>
              <DropdownMenuItem
                nativeButton={false}
                render={<Link href="/pipelines" />}
              >
                <ArrowRight /> Ver oportunidades
              </DropdownMenuItem>
              <DropdownMenuItem
                nativeButton={false}
                render={<Link href="/contacts" />}
              >
                <Users /> Todos os clientes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm"
        >
          <AlertCircle className="text-destructive size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Não foi possível atualizar os leads</p>
            <p className="text-muted-foreground mt-1 break-words">
              {error}
              {current ? ' A lista mantém os últimos dados carregados.' : ''}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <div className={styles.metrics}>
        {segments.map((segment) => (
          <button
            key={segment.id}
            aria-pressed={filter === segment.id}
            onClick={() => chooseFilter(segment.id)}
            className={cn(
              styles.metric,
              filter === segment.id && styles.active
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {segment.label}
              </span>
              <segment.icon className="text-primary size-4 shrink-0" />
            </div>
            <p className="my-2 text-2xl font-semibold tabular-nums">
              {!current ? '—' : counts[segment.id]}
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {segment.hint}
            </p>
          </button>
        ))}
      </div>
      <section
        className={styles.workspace}
        aria-label="Lista de trabalho dos leads"
        aria-busy={loading}
      >
        <div className="space-y-4 border-b p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                A sua fila de acompanhamento
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Prioridade aos benefícios perto do prazo e sem marcação.
              </p>
            </div>
            <p className="text-muted-foreground text-xs" aria-live="polite">
              {current
                ? `${visible.length} de ${rows.length} contactos`
                : error
                  ? 'Dados indisponíveis'
                  : 'A carregar contactos...'}
            </p>
          </div>
          <div className={styles.filters}>
            <div className="relative min-w-0">
              <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
              <Input
                aria-label="Pesquisar leads"
                className="h-10 pr-9 pl-9"
                placeholder="Nome, telefone, email ou referência"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
              {query && (
                <button
                  aria-label="Limpar pesquisa"
                  className="text-muted-foreground absolute top-0 right-0 flex size-10 items-center justify-center"
                  onClick={() => {
                    setQuery('');
                    setPage(0);
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <select
              aria-label="Ordenar leads"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as LeadSort);
                setPage(0);
              }}
            >
              <option value="priority">Prioridade de acompanhamento</option>
              <option value="inactive">Há mais tempo sem sessão</option>
              <option value="recent">Mais recentes primeiro</option>
              <option value="name">Nome de A a Z</option>
            </select>
            <select
              aria-label="Filtrar pela última sessão"
              value={recency}
              onChange={(event) => {
                setRecency(event.target.value as LeadRecency);
                setPage(0);
              }}
            >
              <option value="all">Última sessão: todas</option>
              <option value="30">30+ dias sem sessão</option>
              <option value="60">60+ dias sem sessão</option>
              <option value="90">90+ dias sem sessão</option>
              <option value="never">Sem sessão concluída</option>
            </select>
            <select
              aria-label="Filtrar por género"
              value={gender}
              onChange={(event) => {
                setGender(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todos os géneros</option>
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
              <option value="non_binary">Não binário</option>
              <option value="not_informed">Não informado</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(labels) as LeadFilter[]).map((key) => (
              <Button
                key={key}
                variant={filter === key ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={filter === key}
                onClick={() => chooseFilter(key)}
                className={cn(
                  'rounded-lg text-xs',
                  filter === key && 'text-primary bg-primary/10'
                )}
              >
                {labels[key]}
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {current ? counts[key] : '—'}
                </span>
              </Button>
            ))}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <X className="size-3.5" /> Limpar filtros
              </Button>
            )}
          </div>
        </div>
        {selectedRows.length > 0 && (
          <div
            className={styles.selection}
            role="region"
            aria-label="Contactos selecionados"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {selectedRows.length} selecionado(s) · {eligible.length} com
                marketing autorizado
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {selectedRows.length - eligible.length > 0
                  ? `${selectedRows.length - eligible.length} sem autorização ficam de fora. `
                  : ''}
                A seleção inclui outras páginas e filtros. A campanha abre para
                revisão.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </Button>
              <Button
                size="sm"
                onClick={beginBroadcast}
                disabled={
                  !eligible.length ||
                  !canSendMessages ||
                  loading ||
                  Boolean(error)
                }
              >
                <Megaphone className="size-4" /> Preparar campanha (
                {eligible.length})
              </Button>
            </div>
          </div>
        )}
        {!current && loading ? (
          <div
            className="text-muted-foreground flex min-h-64 items-center justify-center gap-2"
            role="status"
          >
            <Loader2 className="size-5 animate-spin" /> A preparar a fila de
            trabalho...
          </div>
        ) : !current && error ? (
          <div className="text-muted-foreground p-10 text-center text-sm">
            Tente carregar os dados novamente para consultar os leads.
          </div>
        ) : (
          <>
            <div className="text-muted-foreground flex items-center gap-2 border-b px-4 py-3 text-xs sm:px-5">
              <Checkbox
                aria-label="Selecionar contactos desta página"
                checked={allPage}
                indeterminate={somePage && !allPage}
                onCheckedChange={(value) => togglePage(Boolean(value))}
                disabled={!pageRows.length || loading}
              />
              <span>Selecionar esta página</span>
              {current && (
                <span className="ml-auto">
                  Atualizado às{' '}
                  {new Intl.DateTimeFormat('pt-PT', {
                    timeZone: account?.timezone || 'Europe/Lisbon',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(current.at)}
                </span>
              )}
            </div>
            <div className={styles.list}>
              {pageRows.map((row) => (
                <LeadItem
                  key={row.contact.id}
                  row={row}
                  selected={selected.has(row.contact.id)}
                  onSelect={(value) => toggle(row.contact.id, value)}
                  onBook={() => setBooking(row.contact)}
                  onChat={() => void openChat(row.contact)}
                  openingChat={openingChat === row.contact.id}
                  canOperate={canSendMessages && !loading && !error}
                  zone={account?.timezone || 'Europe/Lisbon'}
                />
              ))}
            </div>
            {!visible.length && (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                <Search className="text-muted-foreground size-8" />
                <h3 className="font-medium">
                  {hasFilters
                    ? 'Nenhum contacto corresponde à pesquisa'
                    : 'A sua base de relacionamento começa aqui'}
                </h3>
                <p className="text-muted-foreground max-w-sm text-sm">
                  {hasFilters
                    ? 'Experimente outro nome, telefone ou segmento.'
                    : 'Adicione um contacto para acompanhar o interesse e preparar a primeira marcação.'}
                </p>
                {hasFilters ? (
                  <Button variant="outline" onClick={clear}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button
                    disabled={!canSendMessages}
                    onClick={() => setNewContact(true)}
                  >
                    <Plus /> Novo contacto
                  </Button>
                )}
              </div>
            )}
            {visible.length > 0 && (
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs sm:px-5">
                <p className="text-muted-foreground" aria-live="polite">
                  {activePage * PAGE_SIZE + 1}–
                  {Math.min((activePage + 1) * PAGE_SIZE, visible.length)} de{' '}
                  {visible.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Página anterior"
                    disabled={activePage === 0}
                    onClick={() => setPage(activePage - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span>
                    Página {activePage + 1} de {lastPage + 1}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Página seguinte"
                    disabled={activePage >= lastPage}
                    onClick={() => setPage(activePage + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
      {current?.limited && (
        <p role="status" className="text-muted-foreground text-xs">
          Esta fila apresenta os 2.000 contactos mais recentes. Consulte Todos
          os clientes para pesquisar a base completa.
        </p>
      )}
      <ContactForm
        open={newContact}
        onOpenChange={setNewContact}
        onSaved={() => void load()}
        onViewExisting={(id) => router.push(`/contacts/${id}`)}
      />
      {booking && (
        <InboxBookingDialog
          contact={booking}
          benefit={null}
          onClose={() => setBooking(null)}
          onCreated={() => {
            setBooking(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function LeadItem({
  row,
  selected,
  onSelect,
  onBook,
  onChat,
  openingChat,
  canOperate,
  zone,
}: {
  row: LeadRow;
  selected: boolean;
  onSelect: (value: boolean) => void;
  onBook: () => void;
  onChat: () => void;
  openingChat: boolean;
  canOperate: boolean;
  zone: string;
}) {
  const { contact } = row;
  const name = contact.name || contact.phone || contact.email || 'Sem nome';
  const next = row.nextAppointment
    ? new Intl.DateTimeFormat('pt-PT', {
        timeZone: zone,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(leadTimestamp(row.nextAppointment))
    : null;
  return (
    <article className={cn(styles.row, selected && styles.selected)}>
      <div className={styles.identity}>
        <Checkbox
          aria-label={`Selecionar ${name}`}
          checked={selected}
          onCheckedChange={(value) => onSelect(Boolean(value))}
        />
        <div
          className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          aria-hidden="true"
        >
          {name.slice(0, 2).toLocaleUpperCase('pt-PT')}
        </div>
        <div className="min-w-0">
          <Link
            href={`/contacts/${contact.id}`}
            className="line-clamp-2 text-sm font-semibold hover:underline"
          >
            {name}
          </Link>
          <p
            className="text-muted-foreground mt-1 truncate text-xs"
            title={contact.phone || contact.email}
          >
            {contact.phone || contact.email || 'Sem telefone ou email'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {contact.client_reference && (
              <span className="text-muted-foreground text-[10px]">
                Ref. {contact.client_reference}
              </span>
            )}
            {row.isNew && (
              <Badge variant="secondary" className="text-[10px]">
                Novo
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className={styles.visit}>
        <p className="text-muted-foreground text-[11px]">
          Última sessão concluída
        </p>
        {row.lastSession ? (
          <>
            <p className="mt-1 text-xs font-medium">
              {new Intl.DateTimeFormat('pt-PT', {
                timeZone: zone,
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }).format(leadTimestamp(row.lastSession))}
            </p>
            <p
              className={cn(
                'mt-1 text-xs font-semibold',
                (row.daysSinceSession || 0) >= 60 &&
                  'text-amber-700 dark:text-amber-400'
              )}
            >
              {row.daysSinceSession === 0
                ? 'Veio hoje'
                : `${row.daysSinceSession} dia(s) sem sessão`}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {row.totalSessions} sessão(ões) concluída(s)
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">
            Sem sessão concluída registada
          </p>
        )}
      </div>
      <div className={styles.followup}>
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            next
              ? 'text-emerald-700 dark:text-emerald-400'
              : row.expiring !== undefined
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-foreground'
          )}
        >
          {next ? (
            <CalendarCheck className="size-3.5 shrink-0" />
          ) : row.expiring !== undefined ? (
            <Gift className="size-3.5 shrink-0" />
          ) : (
            <CalendarPlus className="text-primary size-3.5 shrink-0" />
          )}
          {next
            ? `Agendado · ${next}`
            : row.expiring !== undefined
              ? `Benefício vence em ${row.expiring} dia(s)`
              : row.benefits
                ? 'Benefício disponível · por agendar'
                : row.isNew
                  ? 'Acompanhar novo contacto'
                  : 'Retomar acompanhamento'}
        </p>
        <p className="text-muted-foreground mt-1.5 text-xs">
          {row.benefits
            ? `${row.benefits} benefício(s) com saldo livre`
            : 'Sem benefícios disponíveis'}
        </p>
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          {row.ready
            ? 'Marketing WhatsApp autorizado'
            : 'Marketing sem autorização atual'}
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={!canOperate}
          onClick={onBook}
        >
          <CalendarPlus className="size-3.5" /> Agendar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Abrir conversa de ${name}`}
          disabled={openingChat}
          onClick={onChat}
        >
          {openingChat ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MessageCircle className="size-3.5" />
          )}{' '}
          Conversa
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Abrir Cliente 360 de ${name}`}
          nativeButton={false}
          render={<Link href={`/contacts/${contact.id}`} />}
        >
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </article>
  );
}

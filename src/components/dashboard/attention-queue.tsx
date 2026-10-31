'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  CheckCircle2,
  RefreshCw,
  Search,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';
import {
  ATTENTION_KINDS,
  ATTENTION_LABELS,
  type AttentionData,
  type AttentionKind,
} from '@/lib/dashboard/attention-types';
import styles from './attention-queue.module.css';

const at = (value: string) =>
  new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Lisbon',
  }).format(new Date(value));
export function AttentionQueue({ refreshKey = 0 }: { refreshKey?: number }) {
  const [now, setNow] = useState(() => Date.now());
  const { accountId, user, isViewer } = useAuth();
  const [kind, setKind] = useState<AttentionKind | 'all'>('all');
  const [page, setPage] = useState(0),
    [version, setVersion] = useState(0);
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState('');
  const [data, setData] = useState<AttentionData | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${kind}:${page}:${query}`;
  const inFlight = useRef(false);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({}),
    [showSnoozed, setShowSnoozed] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const checkedAt = useRef(0);
  const storageKey = `crm:attention-snoozed:${accountId}:${user?.id}`;
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        setSnoozed(
          Object.fromEntries(
            Object.entries(saved).filter(
              ([, until]) => typeof until === 'number' && until > Date.now()
            )
          ) as Record<string, number>
        );
      } catch {
        setSnoozed({});
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    if (!accountId || isViewer) return;
    inFlight.current = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError('');
      }
    });
    const params = new URLSearchParams({ kind, page: String(page), q: query });
    fetch(`/api/dashboard/attention?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw Error(
            body.error || 'Não foi possível consultar as pendências.'
          );
        if (!controller.signal.aborted) {
          setData(body);
          setLoadedKey(`${kind}:${page}:${query}`);
          setNow(Date.now());
          checkedAt.current = Date.now();
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Falha ao consultar pendências.'
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          inFlight.current = false;
        }
      });
    return () => {
      controller.abort();
      inFlight.current = false;
    };
  }, [accountId, isViewer, kind, page, query, version, refreshKey]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
      if (
        document.visibilityState === 'visible' &&
        !inFlight.current &&
        Date.now() - checkedAt.current > 45000
      )
        setVersion((value) => value + 1);
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  if (isViewer) return null;
  const firstLoad = !data || loadedKey !== requestKey;
  const hidden = (data?.items || []).filter(
    (item) => snoozed[item.id] > now
  ).length;
  const items = (data?.items || []).filter(
    (item) => showSnoozed || !(snoozed[item.id] > now)
  );
  function defer(id: string, undo = false) {
    const next = { ...snoozed };
    if (undo) delete next[id];
    else next[id] = now + 60 * 60_000;
    setSnoozed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setStorageNotice(
        'O adiamento fica válido apenas enquanto esta página estiver aberta.'
      );
    }
  }
  return (
    <section
      id="attention"
      aria-labelledby="attention-title"
      className={styles.root}
      aria-busy={loading || (firstLoad && !error)}
    >
      <header className={styles.header}>
        <div>
          <h2 id="attention-title">Precisa da sua atenção</h2>
          <p>
            Cliente, motivo e próximo passo. As pendências saem da lista quando
            corrigir o registo de origem.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setVersion((value) => value + 1)}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          Atualizar fila
        </Button>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.filters} aria-label="Tipos de pendência">
          <button
            type="button"
            aria-pressed={kind === 'all'}
            onClick={() => {
              setKind('all');
              setPage(0);
            }}
          >
            Todas <span>{data?.total ?? '—'}</span>
          </button>
          {ATTENTION_KINDS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={kind === key}
              onClick={() => {
                setKind(key);
                setPage(0);
              }}
            >
              {ATTENTION_LABELS[key]} <span>{data?.counts[key] ?? '—'}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Pesquisar pendências"
            placeholder="Pesquisar cliente, serviço ou venda…"
            maxLength={100}
            className="h-10 pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {hidden > 0 && (
        <div className={styles.snoozed}>
          <span>
            {hidden} pendência(s) desta página adiadas neste dispositivo.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSnoozed((value) => !value)}
          >
            {showSnoozed ? 'Ocultar adiadas' : 'Mostrar adiadas'}
          </Button>
        </div>
      )}
      {storageNotice && (
        <p className="px-4 py-2 text-xs" role="status">
          {storageNotice}
        </p>
      )}
      {error ? (
        <div role="alert" className={styles.error}>
          <TriangleAlert className="size-5 shrink-0" />
          <div>
            <p>Não foi possível atualizar esta fila.</p>
            <p className="mt-1 text-sm">{error}</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setVersion((value) => value + 1)}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : firstLoad ? (
        <p role="status" className={styles.empty}>
          A consultar as pendências atuais…
        </p>
      ) : !items.length ? (
        <div className={styles.empty}>
          <CheckCircle2 className="mx-auto mb-2 size-6" />
          <p>
            {data?.total === 0
              ? 'Sem pendências nos critérios desta fila.'
              : hidden
                ? 'Não há itens visíveis nesta página. Consulte as adiadas ou avance para a seguinte.'
                : page > 0
                  ? 'Não há registos nesta página. Volte à anterior ou altere o filtro.'
                  : 'Sem pendências neste filtro.'}
          </p>
        </div>
      ) : (
        <div className={styles.list} aria-live="polite">
          {items.map((item) => {
            const deferred = snoozed[item.id] > now;
            return (
              <article
                key={item.id}
                className={styles.row}
                data-urgent={item.urgent}
                data-deferred={deferred}
              >
                <div className={styles.identity}>
                  <span className={styles.category}>
                    {ATTENTION_LABELS[item.kind]}
                    {item.urgent ? ' · Prioridade' : ''}
                  </span>
                  <p className="mt-1 font-semibold break-words">{item.name}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {at(item.occurredAt)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="font-medium break-words">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm break-words">
                    {item.detail}
                  </p>
                  {item.amount !== null && (
                    <p className="mt-2 text-sm font-semibold">
                      Por receber:{' '}
                      {formatCurrency(item.amount, item.currency || 'EUR')}
                    </p>
                  )}
                  {deferred && (
                    <p className="mt-2 text-xs">
                      Adiada até {at(new Date(snoozed[item.id]).toISOString())}
                    </p>
                  )}
                </div>
                <div className={styles.actions}>
                  <Link
                    href={item.href}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    {item.action}
                  </Link>
                  {item.contactId && (
                    <Link
                      href={`/contacts/${encodeURIComponent(item.contactId)}`}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                      })}
                    >
                      Cliente 360
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => defer(item.id, deferred)}
                  >
                    {deferred ? <Undo2 /> : <AlarmClock />}
                    {deferred ? 'Repor na fila' : 'Adiar 1 h'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <footer className={styles.footer}>
        <p>
          {data
            ? `Atualizada às ${new Date(data.generatedAt).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' })} · Europe/Lisbon`
            : 'Consulta da operação'}
          <span>
            Caixas de dias anteriores aparecem sempre; o turno de hoje entra no
            fecho a partir das 21:30. Mensagens na fila há mais de 15 minutos
            também são sinalizadas.
          </span>
        </p>
        <div>
          <Button
            variant="outline"
            disabled={loading || page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground text-xs">
            Página {page + 1}
          </span>
          <Button
            variant="outline"
            disabled={loading || !!error || !data?.hasMore}
            onClick={() => setPage((value) => value + 1)}
          >
            Seguinte
          </Button>
        </div>
      </footer>
    </section>
  );
}

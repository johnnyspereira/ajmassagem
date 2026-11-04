'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
type Activity = {
  id: string;
  scope: string;
  resource_id: string;
  occurred_at: string;
  contact_id: string | null;
  actor_name: string;
  campaign_title: string | null;
};
export function AccessActivityPanel() {
  const [scope, setScope] = useState('');
  const [days, setDays] = useState('30');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{
    rows: Activity[];
    summary: {
      total: number;
      clients: number;
      staff: number;
      campaign_views: number;
    };
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      void fetch(
        `/api/activity?${new URLSearchParams({ scope, days, search, page: String(page) })}`,
        { cache: 'no-store', signal: controller.signal }
      )
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(
              payload.error || 'Não foi possível consultar os acessos.'
            );
          return payload;
        })
        .then(setData)
        .catch((error) => {
          if (!controller.signal.aborted) setError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [scope, days, search, page, revision]);
  return (
    <section className="bg-card rounded-2xl border p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Acessos e interesse nas campanhas</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Clientes identificados no Portal e equipa no CRM. Visitas repetidas
            à mesma página são agrupadas em intervalos de cinco minutos. O
            registo começa com esta atualização.
          </p>
        </div>
        <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
          Atualizar
        </Button>
      </div>
      <div className="my-4 flex flex-wrap gap-2">
        <Input
          className="min-h-11 w-full sm:w-64"
          placeholder="Pesquisar pessoa ou campanha"
          aria-label="Pesquisar acessos"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <select
          className="bg-background min-h-11 rounded-lg border px-3 text-sm"
          aria-label="Tipo de acesso"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos os acessos</option>
          <option value="portal">Clientes no Portal</option>
          <option value="campaign">Campanhas consultadas</option>
          <option value="crm">Equipa no CRM</option>
        </select>
        <select
          className="bg-background min-h-11 rounded-lg border px-3 text-sm"
          aria-label="Período"
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
            setPage(0);
          }}
        >
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
        </select>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : loading ? (
        <p role="status" className="text-muted-foreground py-6 text-sm">
          A carregar acessos…
        </p>
      ) : (
        data && (
          <>
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span>
                <strong>{data.summary.clients}</strong> clientes
              </span>
              <span>
                <strong>{data.summary.staff}</strong> membros da equipa
              </span>
              <span>
                <strong>{data.summary.campaign_views || 0}</strong> consultas de
                campanhas
              </span>
            </div>
            <div className="divide-y">
              {data.rows.length ? (
                data.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {row.contact_id ? (
                          <Link
                            className="underline decoration-dotted underline-offset-4"
                            href={`/contacts/${row.contact_id}`}
                          >
                            {row.actor_name}
                          </Link>
                        ) : (
                          row.actor_name
                        )}
                      </p>
                      <p className="text-muted-foreground mt-1 break-words">
                        {row.scope === 'crm'
                          ? 'CRM'
                          : row.scope === 'campaign'
                            ? 'Campanha'
                            : 'Portal'}{' '}
                        · {row.campaign_title || row.resource_id}
                      </p>
                    </div>
                    <time className="text-muted-foreground text-xs">
                      {new Intl.DateTimeFormat('pt-PT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'Europe/Lisbon',
                      }).format(new Date(row.occurred_at))}
                    </time>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground py-6 text-sm">
                  Ainda não existem acessos neste período e filtro.
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={!page}
                onClick={() => setPage((n) => n - 1)}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground text-xs">
                {Number(data.summary.total)} registos · Página {page + 1}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 50 >= Number(data.summary.total)}
                onClick={() => setPage((n) => n + 1)}
              >
                Seguinte
              </Button>
            </div>
          </>
        )
      )}
    </section>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PackageCheck, Plus } from 'lucide-react';
import {
  BenefitValidityButton,
  useBenefitClock,
} from './benefit-validity-button';
import { BenefitLogList } from './finance-benefit-log-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty } from './finance-ui';
import { money } from './finance-utils';
import { benefitState, benefitStateLabel } from '@/lib/finance/benefit-state';
import type {
  FinanceBenefitLog,
  FinanceClientPack,
  FinancePackCatalog,
} from '@/types';
import styles from './finance-lists.module.css';

export function PacksView({
  packs,
  clientPacks,
  logs,
  currency,
  canConfigure,
  onCreate,
}: {
  packs: FinancePackCatalog[];
  clientPacks: FinanceClientPack[];
  logs: FinanceBenefitLog[];
  currency: string;
  canConfigure: boolean;
  onCreate: () => void;
}) {
  const now = useBenefitClock();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const available = (item: FinanceClientPack) =>
    (item.balances || []).reduce(
      (sum, balance) => sum + Number(balance.remaining_sessions),
      0
    );
  const stateOf = (item: FinanceClientPack) =>
    benefitState(item.status, item.expires_at, available(item), now);
  const visible = clientPacks.filter(
    (item) =>
      (filter === 'all' || stateOf(item) === filter) &&
      [item.contact?.name, item.contact?.phone, item.pack?.name, item.code]
        .join(' ')
        .toLocaleLowerCase('pt')
        .includes(query.trim().toLocaleLowerCase('pt'))
  );
  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <h2>Packs dos clientes</h2>
          <p>Sessões, validade e histórico de cada pacote num só lugar.</p>
        </div>
        {canConfigure && (
          <Button onClick={onCreate}>
            <Plus /> Criar pack
          </Button>
        )}
      </div>
      <div className={styles.summaryStrip} aria-label="Estado dos packs">
        {[
          ['all', 'Todos'],
          ['available', 'Disponíveis'],
          ['used', 'Utilizados'],
          ['expired', 'Expirados'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            <span>{label}</span>
            <strong>
              {value === 'all'
                ? clientPacks.length
                : clientPacks.filter((item) => stateOf(item) === value).length}
            </strong>
          </button>
        ))}
      </div>
      <div className={styles.filters}>
        <label>
          Encontrar pack
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cliente, telefone, pacote ou código"
          />
        </label>
        <label>
          Estado
          <select
            className="bg-background text-foreground rounded-md border px-3 text-sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Todos</option>
            {Object.entries(benefitStateLabel)
              .filter(([key]) => key !== 'active')
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <details className={styles.catalog}>
        <summary>Consultar catálogo · {packs.length} pacotes</summary>
        <div className={styles.catalogGrid}>
          {packs.map((pack) => (
            <div key={pack.id} className={styles.catalogItem}>
              <strong>{pack.name}</strong>
              <p>
                {pack.items
                  ?.map(
                    (item) =>
                      `${item.sessions}× ${item.service?.name || 'Serviço'}`
                  )
                  .join(' · ')}
              </p>
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {money(Number(pack.price), pack.currency || currency)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {pack.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          ))}
        </div>
        {canConfigure && (
          <Link
            href="/settings?tab=clinic&clinicArea=packs"
            className="text-primary mt-3 inline-flex min-h-10 items-center text-sm underline"
          >
            Gerir catálogo e fotografias na Clínica
          </Link>
        )}
      </details>
      <p className="text-muted-foreground text-xs">
        {visible.length} {visible.length === 1 ? 'pack' : 'packs'} nesta vista
      </p>
      <div className={styles.grid}>
        {visible.length ? (
          visible.map((item) => {
            const purchased = (item.balances || []).reduce(
              (sum, balance) => sum + Number(balance.total_sessions),
              0
            );
            const remaining = available(item),
              used = Math.max(0, purchased - remaining),
              state = stateOf(item);
            return (
              <article
                key={item.id}
                className={styles.benefitCard}
                data-state={state}
              >
                <div className={styles.rowHeading}>
                  <div>
                    <h3>
                      {item.contact?.name ||
                        item.contact?.phone ||
                        'Cliente não identificado'}
                    </h3>
                    <p>{item.pack?.name || 'Pack de sessões'}</p>
                  </div>
                  <span className={styles.status} data-state={state}>
                    {benefitStateLabel[state] || state}
                  </span>
                </div>
                <div className={styles.sessions}>
                  <div>
                    <span>Compradas</span>
                    <strong>{purchased}</strong>
                  </div>
                  <div>
                    <span>Utilizadas</span>
                    <strong>{used}</strong>
                  </div>
                  <div>
                    <span>Disponíveis</span>
                    <strong>{remaining}</strong>
                  </div>
                </div>
                <div className="space-y-2">
                  {item.balances?.map((balance) => (
                    <div
                      key={balance.id}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <span>{balance.service?.name || 'Serviço'}</span>
                      <strong className="shrink-0">
                        {balance.remaining_sessions}/{balance.total_sessions}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className={styles.meta}>
                  <span>
                    {item.expires_at
                      ? 'Validade: ' +
                        new Date(item.expires_at).toLocaleDateString('pt-PT', {
                          timeZone: 'Europe/Lisbon',
                        })
                      : 'Sem limite de validade'}
                  </span>
                </div>
                <details className={styles.codes}>
                  <summary>Consultar código e PIN</summary>
                  <p>
                    {item.code || 'Código pendente'} · PIN{' '}
                    {item.pin_code || 'pendente'}
                  </p>
                </details>
                <div className={styles.actions}>
                  <BenefitValidityButton
                    kind="pack"
                    id={item.id}
                    code={item.code}
                    expiresAt={item.expires_at}
                    status={item.status}
                  />
                  {item.sale_id && (
                    <Link
                      href={'/finance?tab=sales#sale-' + item.sale_id}
                      className="text-primary inline-flex min-h-9 items-center text-xs underline"
                    >
                      Consultar venda e comprovativos
                    </Link>
                  )}
                </div>
                <BenefitLogList
                  logs={logs.filter((log) => log.client_pack_id === item.id)}
                  sourceHref={
                    item.sale_id
                      ? '/finance?tab=sales#sale-' + item.sale_id
                      : undefined
                  }
                />
              </article>
            );
          })
        ) : (
          <div className="col-span-full">
            <Empty
              icon={PackageCheck}
              text={
                clientPacks.length
                  ? 'Nenhum pack corresponde aos filtros.'
                  : 'Ainda não existem packs de clientes.'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

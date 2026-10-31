'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  Gift,
  Inbox,
  Loader2,
  Mail,
  PackageCheck,
  Search,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { BenefitsHeader } from './benefits-header';
import { BenefitRegisterRow } from './benefit-register-row';
import {
  benefitState,
  benefitOrder,
  matchesBenefitFilter,
  packRemaining,
  voucherRemaining,
  type BenefitFilter,
} from '@/lib/finance/benefit-availability';
import { useBenefitClock } from './benefit-validity-button';
import styles from './benefits.module.css';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { FinanceClientPack, FinanceVoucher } from '@/types';

type Delivery = {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
};
const money = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
const labels: Record<string, string> = {
  available: 'Disponível',
  expiring: 'A terminar',
  active: 'Ativo',
  pending: 'Pendente',
  used: 'Utilizado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  exhausted: 'Esgotado',
};

export function BenefitsReportPage() {
  const now = useBenefitClock();
  const db = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const [packs, setPacks] = useState<FinanceClientPack[]>([]);
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState('modalities');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BenefitFilter>('available');
  const [grouping, setGrouping] = useState('none');
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingSaleId, setSendingSaleId] = useState<string | null>(null);
  const [voucherToConvert, setVoucherToConvert] =
    useState<FinanceVoucher | null>(null);
  const [packToConvert, setPackToConvert] = useState<FinanceClientPack | null>(
    null
  );
  const [packSessionsToConvert, setPackSessionsToConvert] = useState(1);
  const [convertingVoucher, setConvertingVoucher] = useState(false);
  const [convertingPack, setConvertingPack] = useState(false);
  const [reconcilingPaidAmounts, setReconcilingPaidAmounts] = useState(false);

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    const [packResult, voucherResult, deliveryResult] = await Promise.all([
      db
        .from('finance_client_packs')
        .select(
          '*, contact:contacts(*), pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))'
        )
        .eq('account_id', accountId)
        .order('purchased_at', { ascending: false }),
      db
        .from('finance_vouchers')
        .select('*, owner:contacts(*), service:clinic_services(*)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
      db
        .from('notifications')
        .select('id,type,title,body,created_at')
        .eq('account_id', accountId)
        .eq('user_id', user.id)
        .in('type', [
          'pack_delivery_sent',
          'pack_delivery_failed',
          'voucher_delivery_sent',
          'voucher_delivery_failed',
        ])
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    const error =
      packResult.error || voucherResult.error || deliveryResult.error;
    if (error) {
      setLoadError(error.message);
      toast.error(`Falha ao carregar benefícios: ${error.message}`);
    } else {
      setLoadError(null);
      setPacks((packResult.data ?? []) as FinanceClientPack[]);
      setVouchers((voucherResult.data ?? []) as FinanceVoucher[]);
      setDeliveries((deliveryResult.data ?? []) as Delivery[]);
    }
    setLoading(false);
  }, [accountId, db, user?.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function resendVoucher(voucher: FinanceVoucher) {
    if (!voucher.issued_sale_id)
      return toast.error('Este voucher não está associado a uma venda.');
    if (!voucher.owner?.email)
      return toast.error('O cliente não tem email registado.');
    setSendingSaleId(voucher.issued_sale_id);
    try {
      const response = await fetch('/api/finance/vouchers/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: voucher.issued_sale_id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível enviar o voucher.');
      if (result.sent)
        toast.success(
          `Voucher enviado para ${voucher.owner.email} com PDF anexo.`
        );
      else
        toast.error(
          result.failures?.[0] ||
            'O voucher não foi enviado. Confirme o email do cliente.'
        );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Falha ao reenviar voucher.'
      );
    } finally {
      setSendingSaleId(null);
    }
  }

  async function convertVoucherToBalance() {
    if (!voucherToConvert) return;
    setConvertingVoucher(true);
    try {
      const { data, error } = await db.rpc(
        'convert_service_voucher_to_wallet',
        {
          p_voucher_id: voucherToConvert.id,
          p_note: `Conversão do voucher ${voucherToConvert.code} em cartão-saldo`,
        }
      );
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      toast.success(
        `${money(Number(result?.credited_amount ?? paidVoucherValue(voucherToConvert)), voucherToConvert.currency)} disponível no cartão-saldo do cliente.`
      );
      setVoucherToConvert(null);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível converter o voucher.'
      );
    } finally {
      setConvertingVoucher(false);
    }
  }

  async function convertPackSessionsToBalance() {
    if (!packToConvert) return;
    setConvertingPack(true);
    try {
      const { data, error } = await db.rpc('convert_pack_sessions_to_wallet', {
        p_client_pack_id: packToConvert.id,
        p_sessions: packSessionsToConvert,
      });
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      toast.success(
        `${Number(result?.sessions_converted ?? packSessionsToConvert)} sessão(ões) convertida(s): ${money(Number(result?.credited_amount ?? 0), packToConvert.pack?.currency || 'EUR')} adicionados ao cartão-saldo.`
      );
      setPackToConvert(null);
      setPackSessionsToConvert(1);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível converter as sessões do pack.'
      );
    } finally {
      setConvertingPack(false);
    }
  }

  async function reconcilePaidAmounts() {
    setReconcilingPaidAmounts(true);
    try {
      const { data, error } = await db.rpc(
        'apurar_service_voucher_paid_amounts',
        {}
      );
      if (error) throw new Error(error.message);
      const result = Array.isArray(data) ? data[0] : data;
      const updated = Number(result?.updated ?? 0);
      const unresolved = Number(result?.unresolved ?? 0);
      toast.success(
        updated
          ? `${updated} voucher(s) ficaram prontos para conversão.`
          : 'Não foi encontrado nenhum novo valor para apurar.'
      );
      if (unresolved)
        toast.message(
          `${unresolved} voucher(s) precisam de uma venda com pagamento registado.`
        );
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível apurar os valores pagos.'
      );
    } finally {
      setReconcilingPaidAmounts(false);
    }
  }

  const normalizeSearch = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const term = normalizeSearch(search.trim());
  const matches = (values: Array<string | null | undefined>) =>
    !term ||
    values.some((value) => value && normalizeSearch(value).includes(term));
  const filteredPacks = packs.filter((item) =>
    matches([
      item.contact?.name,
      item.contact?.email,
      item.contact?.phone,
      item.pack?.name,
      item.code,
    ])
  );
  const filteredVouchers = vouchers.filter((item) =>
    matches([
      item.owner?.name,
      item.owner?.email,
      item.owner?.phone,
      item.code,
      item.recipient_name,
      item.service?.name,
    ])
  );
  const serviceVouchers = filteredVouchers.filter(
    (voucher) => voucher.voucher_type === 'service'
  );
  const valueVouchers = filteredVouchers.filter(
    (voucher) => voucher.voucher_type !== 'service'
  );
  const convertibleVouchers = serviceVouchers.filter(canConvertVoucher);
  const stateOfVoucher = (item: FinanceVoucher) =>
    benefitState(item, voucherRemaining(item), now);
  const stateOfPack = (item: FinanceClientPack) =>
    benefitState(item, packRemaining(item), now);
  const sortVouchers = (items: FinanceVoucher[]) =>
    [...items].sort((left, right) =>
      benefitOrder(
        { ...left, state: stateOfVoucher(left) },
        { ...right, state: stateOfVoucher(right) }
      )
    );
  const matchingServices = sortVouchers(
    serviceVouchers.filter((item) =>
      matchesBenefitFilter(stateOfVoucher(item), statusFilter)
    )
  );
  const matchingValues = sortVouchers(
    valueVouchers.filter((item) =>
      matchesBenefitFilter(stateOfVoucher(item), statusFilter)
    )
  );
  const matchingPacks = filteredPacks
    .filter((item) => matchesBenefitFilter(stateOfPack(item), statusFilter))
    .sort((left, right) =>
      benefitOrder(
        { ...left, state: stateOfPack(left) },
        { ...right, state: stateOfPack(right) }
      )
    );
  const groupedServices = groupByService(
    matchingServices.slice(0, visibleLimit),
    grouping
  );
  const filterStates =
    activeTab === 'packs'
      ? filteredPacks.map(stateOfPack)
      : (activeTab === 'value' ? valueVouchers : serviceVouchers).map(
          stateOfVoucher
        );
  const matchingCount =
    activeTab === 'packs'
      ? matchingPacks.length
      : activeTab === 'value'
        ? matchingValues.length
        : matchingServices.length;
  function switchTab(tab: string) {
    setActiveTab(tab);
    setVisibleLimit(20);
  }
  function shortcut(tab: string) {
    switchTab(tab);
    setSearch('');
    setStatusFilter('available');
  }
  const archivedVouchers = serviceVouchers.filter(
    (voucher) => !canConvertVoucher(voucher)
  );
  const activePacks = packs.filter((item) =>
    matchesBenefitFilter(stateOfPack(item), 'available')
  );
  const sessions = activePacks.reduce(
    (sum, item) =>
      sum +
      (item.balances ?? []).reduce(
        (total, balance) => total + Number(balance.remaining_sessions),
        0
      ),
    0
  );
  const activeServices = vouchers.filter(
    (item) =>
      item.voucher_type === 'service' &&
      matchesBenefitFilter(stateOfVoucher(item), 'available')
  );
  const activeValueVouchers = vouchers.filter(
    (item) =>
      item.voucher_type !== 'service' &&
      matchesBenefitFilter(stateOfVoucher(item), 'available')
  );
  const valueBalance = activeValueVouchers.reduce(
    (sum, item) => sum + Number(item.current_balance || 0),
    0
  );

  return (
    <main className={cn(styles.root, 'space-y-5')}>
      <BenefitsHeader
        loading={loading}
        reconciling={reconcilingPaidAmounts}
        onRefresh={() => void load()}
        onReconcile={() => void reconcilePaidAmounts()}
        onDeliveries={() => setActiveTab('deliveries')}
      />
      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:bg-rose-950 dark:text-rose-100"
        >
          <p>Não foi possível atualizar os benefícios: {loadError}</p>
          <Button variant="outline" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      )}
      <section className={styles.metrics}>
        <Metric
          icon={PackageCheck}
          tone="emerald"
          label="Packs utilizáveis"
          onClick={() => shortcut('packs')}
          value={activePacks.length}
          detail={`${sessions} sessões disponíveis`}
        />
        <Metric
          icon={Gift}
          tone="violet"
          label="Vouchers por modalidade"
          onClick={() => shortcut('modalities')}
          value={activeServices.length}
          detail="Sessões ativas por serviço"
        />
        <Metric
          icon={WalletCards}
          tone="sky"
          label="Cartões de valor"
          onClick={() => shortcut('value')}
          value={activeValueVouchers.length}
          detail={
            valueBalance
              ? `${money(valueBalance)} disponíveis`
              : 'Sem saldo ativo'
          }
        />
        <Metric
          icon={ArrowRightLeft}
          tone="amber"
          label="Prontos a converter"
          onClick={() => switchTab('convert')}
          value={convertibleVouchers.length}
          detail="Voucher → cartão-saldo"
        />
      </section>
      <section className={styles.search}>
        <div className="relative max-w-2xl">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="h-11 rounded-xl pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleLimit(20);
            }}
            aria-label="Pesquisar benefícios"
            placeholder="Pesquisar cliente, modalidade, telefone, voucher ou código..."
          />
        </div>
      </section>
      <Tabs value={activeTab} onValueChange={switchTab} className="space-y-5">
        <nav aria-label="Tipos de benefícios" className={styles.tabsNav}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger
              className={cn(
                styles.tab,
                'data-active:bg-primary/10 data-active:text-primary'
              )}
              value="modalities"
            >
              Vouchers de sessão{' '}
              <Badge variant="secondary">{serviceVouchers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger
              className={cn(
                styles.tab,
                'data-active:bg-primary/10 data-active:text-primary'
              )}
              value="packs"
            >
              Packs <Badge variant="secondary">{filteredPacks.length}</Badge>
            </TabsTrigger>
            <TabsTrigger
              className={cn(
                styles.tab,
                'data-active:bg-primary/10 data-active:text-primary'
              )}
              value="value"
            >
              Cartões de valor{' '}
              <Badge variant="secondary">{valueVouchers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger
              className={cn(
                styles.tab,
                'data-active:bg-primary/10 data-active:text-primary'
              )}
              value="convert"
            >
              Converter em saldo{' '}
              <Badge variant="secondary">{convertibleVouchers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger
              className={cn(
                styles.tab,
                'data-active:bg-primary/10 data-active:text-primary'
              )}
              value="deliveries"
            >
              Envios <Badge variant="secondary">{deliveries.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </nav>
        {['modalities', 'packs', 'value'].includes(activeTab) && (
          <section className={styles.filters} aria-label="Filtrar benefícios">
            <div className={styles.filterChips}>
              {(
                [
                  ['available', 'Disponíveis'],
                  ['expiring', 'A terminar'],
                  ['expired', 'Expirados'],
                  ['used', 'Utilizados'],
                  ['pending', 'Por ativar'],
                  ['all', 'Todos'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={statusFilter === value}
                  onClick={() => {
                    setStatusFilter(value);
                    setVisibleLimit(20);
                  }}
                >
                  {label}
                  <span>
                    {
                      filterStates.filter((state) =>
                        matchesBenefitFilter(state, value)
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs" role="status">
                {loading
                  ? 'A atualizar os benefícios…'
                  : `${matchingCount} de ${filterStates.length} registos · ${statusFilter === 'available' ? 'com saldo e dentro da validade' : statusFilter === 'expiring' ? 'validade a terminar nos próximos 7 dias' : 'conforme o filtro selecionado'}`}
              </p>
              {activeTab === 'modalities' && (
                <label className="flex items-center gap-2 text-xs">
                  Agrupar por
                  <select
                    value={grouping}
                    onChange={(event) => setGrouping(event.target.value)}
                    className="bg-background min-h-9 rounded-lg border px-2"
                  >
                    <option value="none">Sem grupos</option>
                    <option value="service">Modalidade</option>
                    <option value="client">Cliente</option>
                  </select>
                </label>
              )}
            </div>
          </section>
        )}
        <TabsContent value="modalities" className="mt-0 space-y-6">
          <SectionIntro
            title="Vouchers de sessão"
            description="Consulte o saldo e a validade. Abra Detalhes e opções para gerir o voucher."
          />
          {groupedServices.map(([serviceName, items]) => (
            <section key={serviceName} className="space-y-3">
              {grouping !== 'none' && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h2 className="font-semibold">
                      {grouping === 'client'
                        ? items[0]?.owner?.name ||
                          items[0]?.recipient_name ||
                          'Cliente não associado'
                        : serviceName}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {items.length}{' '}
                      {items.length === 1 ? 'voucher' : 'vouchers'} ·{' '}
                      {
                        items.filter((item) =>
                          matchesBenefitFilter(
                            stateOfVoucher(item),
                            'available'
                          )
                        ).length
                      }{' '}
                      ativo(s)
                    </p>
                  </div>
                  <Badge variant="outline">
                    {grouping === 'client' ? 'Cliente' : 'Modalidade'}
                  </Badge>
                </div>
              )}
              <div className="space-y-3">
                {items.map((voucher) => (
                  <VoucherCard
                    key={voucher.id}
                    voucher={voucher}
                    now={now}
                    sending={Boolean(
                      sendingSaleId && sendingSaleId === voucher.issued_sale_id
                    )}
                    onResend={() => void resendVoucher(voucher)}
                    onConvert={() => setVoucherToConvert(voucher)}
                    onUpdated={() => void load()}
                  />
                ))}
              </div>
            </section>
          ))}
          {!matchingServices.length && !loading && (
            <Empty
              icon={Gift}
              text="Nenhum voucher neste filtro. Experimente Todos ou altere a pesquisa."
            />
          )}
        </TabsContent>
        <TabsContent value="convert" className="mt-0 space-y-5">
          <Card className={styles.conversion}>
            <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="mb-2 flex items-center gap-2 text-violet-800">
                  <ArrowRightLeft className="size-5" />
                  <span className="font-semibold">
                    Converter voucher em cartão-saldo
                  </span>
                </div>
                <p className="text-muted-foreground max-w-3xl text-sm leading-6">
                  A conversão encerra o voucher de sessão e coloca o valor pago
                  no cartão-saldo do mesmo cliente. Depois, esse crédito pode
                  pagar qualquer modalidade no POS.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="w-fit bg-violet-700 text-white hover:bg-violet-700">
                  {convertibleVouchers.length} disponível(is)
                </Badge>
              </div>
            </CardContent>
          </Card>
          {convertibleVouchers.length ? (
            <div className="space-y-3">
              <SectionIntro
                title="Escolha o voucher a converter"
                description="Confirme o valor antes de concluir. Esta ação não pode ser desfeita."
              />
              {convertibleVouchers.map((voucher) => (
                <ConversionRow
                  key={voucher.id}
                  voucher={voucher}
                  onConvert={() => setVoucherToConvert(voucher)}
                />
              ))}
            </div>
          ) : (
            <ConversionEmpty serviceVouchers={serviceVouchers} />
          )}
          {archivedVouchers.length > 0 && (
            <section className="space-y-3">
              <SectionIntro
                title="Não elegíveis neste momento"
                description="Estes vouchers ficam visíveis aqui para explicar por que não aparece o botão de conversão."
              />
              <div className="grid gap-3 lg:grid-cols-2">
                {archivedVouchers.map((voucher) => (
                  <ConversionReasonCard key={voucher.id} voucher={voucher} />
                ))}
              </div>
            </section>
          )}
        </TabsContent>
        <TabsContent value="value" className="mt-0 space-y-4">
          <SectionIntro
            title="Cartões de valor e saldo livre"
            description="Estes vouchers já representam valor monetário. Não precisam de conversão: podem ser usados no POS conforme as regras da venda."
          />
          <div className="space-y-3">
            {matchingValues.slice(0, visibleLimit).map((voucher) => (
              <VoucherCard
                key={voucher.id}
                voucher={voucher}
                now={now}
                sending={Boolean(
                  sendingSaleId && sendingSaleId === voucher.issued_sale_id
                )}
                onResend={() => void resendVoucher(voucher)}
                onConvert={() => setVoucherToConvert(voucher)}
                onUpdated={() => void load()}
              />
            ))}
          </div>
          {!matchingValues.length && !loading && (
            <Empty
              icon={WalletCards}
              text="Nenhum cartão de valor encontrado."
            />
          )}
        </TabsContent>
        <TabsContent value="packs" className="mt-0 space-y-3">
          <SectionIntro
            title="Packs dos clientes"
            description="Veja as sessões restantes de cada modalidade e abra os detalhes para gerir o pack."
          />
          {matchingPacks.slice(0, visibleLimit).map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              now={now}
              onUpdated={() => void load()}
              onConvert={() => {
                setPackSessionsToConvert(1);
                setPackToConvert(pack);
              }}
            />
          ))}
          {!matchingPacks.length && !loading && (
            <Empty
              icon={PackageCheck}
              text="Nenhum pack neste filtro. Experimente Todos ou altere a pesquisa."
            />
          )}
        </TabsContent>
        <TabsContent value="deliveries" className="mt-0 space-y-3">
          {deliveries.map((item) => (
            <Card key={item.id} className="gap-0">
              <CardContent className={styles.delivery}>
                <div
                  className={cn(
                    'rounded-xl p-2',
                    item.type.endsWith('_failed')
                      ? 'bg-red-50 text-red-600'
                      : 'bg-emerald-50 text-emerald-600'
                  )}
                >
                  {item.type.endsWith('_failed') ? (
                    <Inbox className="size-5" />
                  ) : (
                    <CheckCircle2 className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {item.body}
                  </p>
                </div>
                <time className="text-muted-foreground text-xs">
                  {new Date(item.created_at).toLocaleString('pt-PT')}
                </time>
              </CardContent>
            </Card>
          ))}
          {!deliveries.length && (
            <Empty icon={Mail} text="Ainda não há entregas registadas." />
          )}
        </TabsContent>
      </Tabs>
      {['modalities', 'packs', 'value'].includes(activeTab) &&
        matchingCount > visibleLimit && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setVisibleLimit((value) => value + 20)}
            >
              Mostrar mais {Math.min(20, matchingCount - visibleLimit)} ·{' '}
              {matchingCount - visibleLimit} por mostrar
            </Button>
          </div>
        )}
      <Dialog
        open={Boolean(voucherToConvert)}
        onOpenChange={(open) => !open && setVoucherToConvert(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter voucher em cartão-saldo?</DialogTitle>
            <DialogDescription>
              {voucherToConvert
                ? `O cliente pagou ${money(paidVoucherValue(voucherToConvert), voucherToConvert.currency)} pelo voucher ${voucherToConvert.code}. Este é o valor que será adicionado ao cartão-saldo.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            O voucher deixará de poder ser usado como sessão. O cartão-saldo
            poderá ser usado no POS em qualquer modalidade, até ao valor pago
            pelo cliente.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVoucherToConvert(null)}
              disabled={convertingVoucher}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void convertVoucherToBalance()}
              disabled={convertingVoucher}
            >
              {convertingVoucher ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRightLeft />
              )}{' '}
              Converter em saldo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(packToConvert)}
        onOpenChange={(open) =>
          !open && !convertingPack && setPackToConvert(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter sessões do pack em saldo</DialogTitle>
            <DialogDescription>
              {packToConvert
                ? `${packToConvert.contact?.name || 'Cliente'} · ${packToConvert.pack?.name || 'Pack'} · ${remainingPackSessions(packToConvert)} sessão(ões) disponíveis.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label
              htmlFor="pack-sessions-to-convert"
              className="text-sm font-medium"
            >
              Quantas sessões quer converter?
            </label>
            <Input
              id="pack-sessions-to-convert"
              type="number"
              min={1}
              max={packToConvert ? remainingPackSessions(packToConvert) : 1}
              step={1}
              value={packSessionsToConvert}
              onChange={(event) =>
                setPackSessionsToConvert(
                  Math.max(
                    1,
                    Math.min(
                      Number(event.target.value) || 1,
                      packToConvert ? remainingPackSessions(packToConvert) : 1
                    )
                  )
                )
              }
            />
            <p className="text-muted-foreground text-sm">
              O crédito é calculado proporcionalmente ao valor efetivamente pago
              pelo pack. As restantes sessões continuam disponíveis.
            </p>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Depois de confirmar, as sessões escolhidas deixam de poder ser
              usadas no pack. Esta operação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPackToConvert(null)}
              disabled={convertingPack}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void convertPackSessionsToBalance()}
              disabled={
                convertingPack ||
                !packToConvert ||
                packSessionsToConvert < 1 ||
                packSessionsToConvert > remainingPackSessions(packToConvert)
              }
            >
              {convertingPack ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRightLeft />
              )}{' '}
              Converter {packSessionsToConvert} sessão(ões)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function paidVoucherValue(voucher: FinanceVoucher) {
  return Number(voucher.paid_amount ?? 0);
}
function canConvertVoucher(voucher: FinanceVoucher) {
  return (
    voucher.voucher_type === 'service' &&
    voucher.status === 'active' &&
    (!voucher.expires_at || Date.parse(voucher.expires_at) > Date.now()) &&
    Number(voucher.remaining_uses ?? 0) > 0 &&
    Boolean(voucher.owner_contact_id) &&
    paidVoucherValue(voucher) > 0
  );
}
function conversionReason(voucher: FinanceVoucher) {
  if (voucher.voucher_type !== 'service')
    return 'Cartões de valor já podem ser usados no POS; não precisam de conversão.';
  if (voucher.status === 'pending')
    return 'Aguarda pagamento. Assim que ficar ativo, poderá ser convertido se ainda tiver sessão disponível.';
  if (voucher.status === 'cancelled')
    return 'Foi cancelado e não pode ser convertido em saldo.';
  if (
    voucher.status === 'expired' ||
    (voucher.expires_at && Date.parse(voucher.expires_at) <= Date.now())
  )
    return 'A validade terminou e este voucher já não pode ser convertido.';
  if (voucher.status === 'used')
    return 'Já não tem sessões disponíveis para converter.';
  if (!voucher.owner_contact_id)
    return 'Associe primeiro um cliente a este voucher.';
  if (Number(voucher.remaining_uses ?? 0) <= 0)
    return 'Já não há sessão disponível neste voucher.';
  if (paidVoucherValue(voucher) <= 0)
    return 'O valor pago ainda está a ser apurado a partir da venda deste voucher.';
  return 'Disponível para conversão em cartão-saldo.';
}
function groupByService(vouchers: FinanceVoucher[], grouping: string) {
  const groups = new Map<string, FinanceVoucher[]>();
  vouchers.forEach((voucher) => {
    const key =
      grouping === 'none'
        ? 'Todos'
        : grouping === 'client'
          ? `${voucher.owner?.name || voucher.recipient_name || 'Cliente não associado'} · ${voucher.owner_contact_id || voucher.id}`
          : voucher.service?.name || 'Modalidade não definida';
    groups.set(key, [...(groups.get(key) ?? []), voucher]);
  });
  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right, 'pt-PT')
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
  detail: string;
  onClick: () => void;
  tone: 'emerald' | 'violet' | 'sky' | 'amber';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(styles.metric, 'text-left')}
    >
      <div className={styles.metricIcon}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="my-2 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          {detail}
        </p>
      </div>
    </button>
  );
}
function Status({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === 'active' || value === 'available'
          ? 'default'
          : value === 'expired' || value === 'cancelled'
            ? 'destructive'
            : 'secondary'
      }
    >
      {labels[value] || value}
    </Badge>
  );
}
function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </div>
  );
}
function ConversionRow({
  voucher,
  onConvert,
}: {
  voucher: FinanceVoucher;
  onConvert: () => void;
}) {
  return (
    <Card className="gap-0">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700">
          <ArrowRightLeft className="size-5" />
        </div>
        <div className="min-w-48 flex-1">
          <p className="font-semibold">
            {voucher.owner?.name ||
              voucher.recipient_name ||
              'Cliente não definido'}
          </p>
          <p className="text-muted-foreground text-sm">
            {voucher.service?.name || 'Voucher de serviço'} · {voucher.code}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Preço original:{' '}
            {money(Number(voucher.initial_balance), voucher.currency)}
          </p>
        </div>
        <div className="text-sm">
          <p className="text-muted-foreground">
            Pago pelo cliente · saldo a creditar
          </p>
          <p className="font-semibold text-emerald-700">
            {money(paidVoucherValue(voucher), voucher.currency)}
          </p>
        </div>
        <Button onClick={onConvert}>
          <ArrowRightLeft /> Converter em saldo
        </Button>
      </CardContent>
    </Card>
  );
}
function ConversionReasonCard({ voucher }: { voucher: FinanceVoucher }) {
  const now = useBenefitClock();
  return (
    <Card className="gap-0">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">
            {voucher.service?.name || 'Modalidade não definida'}
          </p>
          <Status value={benefitState(voucher, voucherRemaining(voucher), now)} />
        </div>
        <p className="text-sm">
          {voucher.owner?.name ||
            voucher.recipient_name ||
            'Cliente não associado'}{' '}
          · <code className="text-xs">{voucher.code}</code>
        </p>
        <p className="text-muted-foreground text-sm">
          {conversionReason(voucher)}
        </p>
      </CardContent>
    </Card>
  );
}
function ConversionEmpty({
  serviceVouchers,
}: {
  serviceVouchers: FinanceVoucher[];
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="grid gap-5 p-6 md:grid-cols-[auto_1fr]">
        <div className="h-fit rounded-2xl bg-amber-100 p-3 text-amber-700">
          <ArrowRightLeft className="size-6" />
        </div>
        <div>
          <h2 className="font-semibold">
            Ainda não há voucher pronto a converter
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            Para aparecer aqui, o voucher deve estar <strong>Ativo</strong>, ter
            pelo menos uma sessão disponível, estar associado a um cliente e ter
            valor registado.
          </p>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <p className="bg-muted rounded-lg p-3">
              <strong>
                {
                  serviceVouchers.filter(
                    (voucher) => voucher.status === 'pending'
                  ).length
                }
              </strong>
              <br />
              <span className="text-muted-foreground">aguardam pagamento</span>
            </p>
            <p className="bg-muted rounded-lg p-3">
              <strong>
                {
                  serviceVouchers.filter(
                    (voucher) => voucher.status === 'cancelled'
                  ).length
                }
              </strong>
              <br />
              <span className="text-muted-foreground">foram cancelados</span>
            </p>
            <p className="bg-muted rounded-lg p-3">
              <strong>
                {
                  serviceVouchers.filter(
                    (voucher) => voucher.status === 'active'
                  ).length
                }
              </strong>
              <br />
              <span className="text-muted-foreground">ativos a verificar</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function VoucherCard({
  voucher,
  now,
  sending,
  onResend,
  onConvert,
  onUpdated,
}: {
  voucher: FinanceVoucher;
  now: number;
  sending: boolean;
  onResend: () => void;
  onConvert: () => void;
  onUpdated: () => void;
}) {
  return (
    <BenefitRegisterRow
      voucher={voucher}
      now={now}
      sending={sending}
      onResend={onResend}
      onConvert={onConvert}
      canConvert={canConvertVoucher(voucher)}
      onUpdated={onUpdated}
    />
  );
}
function remainingPackSessions(pack: FinanceClientPack) {
  return packRemaining(pack);
}
function PackCard({
  pack,
  now,
  onConvert,
  onUpdated,
}: {
  pack: FinanceClientPack;
  now: number;
  onConvert: () => void;
  onUpdated: () => void;
}) {
  return (
    <BenefitRegisterRow
      pack={pack}
      now={now}
      onConvert={onConvert}
      canConvert={packRemaining(pack) > 0}
      onUpdated={onUpdated}
    />
  );
}
function Empty({ icon: Icon, text }: { icon: typeof Gift; text: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed p-12 text-center">
      <div className="bg-muted text-muted-foreground mx-auto mb-3 w-fit rounded-2xl p-3">
        <Icon className="size-6" />
      </div>
      <p className="font-medium">{text}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        Use a pesquisa ou crie uma nova venda no POS.
      </p>
    </div>
  );
}

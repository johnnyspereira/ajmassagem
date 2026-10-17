'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CalendarPlus,
  ArrowUpRight,
  RefreshCw,
  TriangleAlert,
  MessageSquare,
  ReceiptText,
  Wallet,
  Clock3,
  CheckCheck,
  Gift,
  PackageCheck,
  BarChart3,
  ListTodo,
  History,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  loadActivity,
  loadAutomationInsights,
  loadConversationsSeries,
  loadInboxOperations,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
  loadSalesInsights,
  loadTeamPerformance,
  loadTodayOperations,
  loadWhatsAppHealth,
  loadExpiringBenefits,
  loadPortalPendingConfirmations,
} from '@/lib/dashboard/queries';
import type {
  ActivityItem,
  AutomationInsights,
  ConversationsSeriesPoint,
  InboxOperations,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
  SalesInsights,
  TeamPerformance,
  TodayOperations,
  WhatsAppHealth,
  ExpiringBenefitItem,
  PortalPendingConfirmationItem,
} from '@/lib/dashboard/types';
import { DayAgenda } from '@/components/dashboard/day-agenda';
import { PortalPendingConfirmationsCard } from '@/components/dashboard/portal-pending-confirmations';
import { ConversationsChart } from '@/components/dashboard/conversations-chart';
import { PipelineDonut } from '@/components/dashboard/pipeline-donut';
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { FollowUpCommandCenter } from '@/components/dashboard/follow-up-command-center';
import {
  AutomationInsightsPanel,
  InboxOperationsPanel,
  SalesInsightsPanel,
  TeamPerformancePanel,
} from '@/components/dashboard/operations-panels';

type RangeDays = 7 | 30 | 90;

export default function DashboardPage() {
  const { defaultCurrency, profile } = useAuth();
  const [view, setView] = useState<'day' | 'reports' | 'activity'>('day');
  const viewRef = useRef<'day' | 'reports' | 'activity'>('day');
  const inFlight = useRef(false);
  const pendingLoad = useRef<(() => void) | null>(null);
  const loadVersion = useRef(0);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});

  const [range, setRange] = useState<RangeDays>(30);
  // Keep a cache per range so switching tabs doesn't re-fetch what we
  // already have. Ranges the user hasn't opened yet stay null and
  // trigger a fetch on first view.
  const [series, setSeries] = useState<
    Record<RangeDays, ConversationsSeriesPoint[] | null>
  >({
    7: null,
    30: null,
    90: null,
  });
  const [seriesLoading, setSeriesLoading] = useState(true);

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(
    null
  );
  const [responseTimeLoading, setResponseTimeLoading] = useState(true);

  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  const [whatsapp, setWhatsApp] = useState<WhatsAppHealth | null>(null);
  const [whatsappLoading, setWhatsAppLoading] = useState(true);

  const [inboxOps, setInboxOps] = useState<InboxOperations | null>(null);
  const [inboxOpsLoading, setInboxOpsLoading] = useState(true);

  const [sales, setSales] = useState<SalesInsights | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);

  const [automation, setAutomation] = useState<AutomationInsights | null>(null);
  const [automationLoading, setAutomationLoading] = useState(true);

  const [team, setTeam] = useState<TeamPerformance | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [today, setToday] = useState<TodayOperations | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [expiringBenefits, setExpiringBenefits] = useState<
    ExpiringBenefitItem[] | null
  >(null);
  const [expiringBenefitsLoading, setExpiringBenefitsLoading] = useState(true);
  const [portalPending, setPortalPending] = useState<
    PortalPendingConfirmationItem[] | null
  >(null);
  const [portalPendingLoading, setPortalPendingLoading] = useState(true);
  const dashboardDataUnavailable =
    !todayLoading &&
    !inboxOpsLoading &&
    !today &&
    !inboxOps &&
    Boolean(loadErrors['Operação diária']) &&
    Boolean(loadErrors.Inbox);

  const loadAll: (
    rangeToLoad?: RangeDays,
    showLoading?: boolean,
    scope?: 'day' | 'reports' | 'activity'
  ) => void = useCallback(
    (rangeToLoad = 30, showLoading = true, scope = viewRef.current) => {
      if (inFlight.current) {
        pendingLoad.current = () => loadAll(rangeToLoad, showLoading, scope);
        return;
      }
      inFlight.current = true;
      const version = ++loadVersion.current;
      const db = createClient();
      setRefreshing(true);
      const tasks: Array<() => Promise<void>> = [];
      const keys: string[] = [];
      let failed = false;
      function add<T>(
        key: string,
        read: () => Promise<T>,
        save: (value: T) => void,
        loading: (value: boolean) => void
      ) {
        keys.push(key);
        if (showLoading) loading(true);
        tasks.push(async () => {
          try {
            const value = await read();
            if (loadVersion.current === version) save(value);
          } catch (error) {
            failed = true;
            console.error('[dashboard] ' + key + ' failed:', error);
            const detail =
              error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : 'Falha ao carregar';
            if (loadVersion.current === version)
              setLoadErrors((current) => ({ ...current, [key]: detail }));
          } finally {
            if (loadVersion.current === version) loading(false);
          }
        });
      }
      // Agenda and pending requests first. Reports never load in the day view.
      add(
        'Operação diária',
        () => loadTodayOperations(db),
        setToday,
        setTodayLoading
      );
      add(
        'Inbox',
        () => loadInboxOperations(db),
        setInboxOps,
        setInboxOpsLoading
      );
      add(
        'WhatsApp',
        () => loadWhatsAppHealth(db),
        setWhatsApp,
        setWhatsAppLoading
      );
      if (scope === 'day') {
        add(
          'Marcações do Portal 360',
          () => loadPortalPendingConfirmations(db),
          setPortalPending,
          setPortalPendingLoading
        );
        add(
          'Validades',
          () => loadExpiringBenefits(db),
          setExpiringBenefits,
          setExpiringBenefitsLoading
        );
        add(
          'Comercial',
          () => loadSalesInsights(db),
          setSales,
          setSalesLoading
        );
        add(
          'Automações',
          () => loadAutomationInsights(db),
          setAutomation,
          setAutomationLoading
        );
      } else if (scope === 'reports') {
        add(
          'Indicadores',
          () => loadMetrics(db),
          setMetrics,
          setMetricsLoading
        );
        add(
          'Conversas',
          () => loadConversationsSeries(db, rangeToLoad),
          (value) =>
            setSeries((previous) => ({ ...previous, [rangeToLoad]: value })),
          setSeriesLoading
        );
        add(
          'Pipeline',
          () => loadPipelineDonut(db),
          setPipeline,
          setPipelineLoading
        );
        add(
          'Tempo de resposta',
          () => loadResponseTime(db),
          setResponseTime,
          setResponseTimeLoading
        );
        add(
          'Comercial',
          () => loadSalesInsights(db),
          setSales,
          setSalesLoading
        );
        add(
          'Automações',
          () => loadAutomationInsights(db),
          setAutomation,
          setAutomationLoading
        );
        add('Equipa', () => loadTeamPerformance(db), setTeam, setTeamLoading);
      } else {
        add(
          'Atividade',
          () => loadActivity(db, 50),
          setActivity,
          setActivityLoading
        );
      }
      setLoadErrors((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !keys.includes(key))
        )
      );
      // Each section can issue several SQL requests; process sections in order.
      void (async () => {
        try {
          for (const task of tasks) await task();
        } finally {
          inFlight.current = false;
          if (loadVersion.current === version) {
            setRefreshing(false);
            if (!failed) setLastUpdatedAt(new Date());
          }
          const pending = pendingLoad.current;
          pendingLoad.current = null;
          pending?.();
        }
      })();
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) loadAll(30, false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadAll(range, false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadAll, range]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadAll(range, false);
    };
    window.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [loadAll, range]);

  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r);
      if (series[r] !== null) return;
      setSeriesLoading(true);
      const db = createClient();
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false));
    },
    [series]
  );

  const handleAppointmentChanged = (id: string) => {
    setPortalPending(
      (current) => current?.filter((item) => item.id !== id) ?? null
    );
    loadVersion.current++;
    loadAll(range, false);
  };
  const whatsappOnline = whatsapp?.qrConnected || whatsapp?.metaConnected;
  return (
    <div className="mx-auto max-w-[1480px] space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium capitalize">
            {new Date().toLocaleDateString('pt-PT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Olá
            {profile?.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}.
            Vamos organizar o dia.
          </h1>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  whatsappLoading
                    ? 'bg-slate-400'
                    : whatsappOnline
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                )}
              />
              {whatsappLoading
                ? 'A verificar WhatsApp'
                : loadErrors.WhatsApp
                  ? 'WhatsApp indisponível'
                  : whatsappOnline
                    ? 'WhatsApp conectado'
                    : 'WhatsApp desconectado'}
            </span>
            {lastUpdatedAt && (
              <span>
                Atualizado às{' '}
                {lastUpdatedAt.toLocaleTimeString('pt-PT', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar dashboard"
            title="Atualizar dashboard"
            onClick={() => loadAll(range)}
            disabled={refreshing}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </Button>
          <Link
            href="/finance?tab=pos"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ReceiptText className="size-4" />
            Nova venda
          </Link>
          <Link href="/agenda?new=1" className={buttonVariants()}>
            <CalendarPlus className="size-4" />
            Nova marcação
          </Link>
        </div>
      </header>
      {Object.keys(loadErrors).length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium">
                Alguns dados estão indisponíveis
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {Object.keys(loadErrors).join(' · ')}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => loadAll(range)}>
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary
          label="Marcações de hoje"
          value={todayLoading ? '…' : String(today?.appointmentsTotal ?? '—')}
          detail={
            today
              ? today.confirmed +
                ' confirmadas · ' +
                today.completed +
                ' concluídas'
              : 'Agenda do dia'
          }
          icon={CalendarDays}
          href="/agenda"
        />
        <Summary
          label="Recebido hoje"
          value={
            todayLoading
              ? '…'
              : today?.receivedToday == null
                ? '—'
                : formatCurrency(today.receivedToday, defaultCurrency)
          }
          detail={
            today?.cashSessionOpen == null
              ? 'Estado de caixa indisponível'
              : today.cashSessionOpen
                ? 'Caixa aberto'
                : 'Caixa fechado'
          }
          icon={Wallet}
          href="/finance?tab=pos"
        />
        <Summary
          label="Por receber hoje"
          value={
            todayLoading
              ? '…'
              : today?.outstandingToday == null
                ? '—'
                : formatCurrency(today.outstandingToday, defaultCurrency)
          }
          detail="Valores em aberto na agenda"
          icon={Clock3}
          href="/finance"
        />
        <Summary
          label="Clientes à espera"
          value={
            inboxOpsLoading
              ? '…'
              : inboxOps
                ? String(inboxOps.waitingAgent)
                : '—'
          }
          detail={
            inboxOps
              ? inboxOps.unread + ' conversas não lidas'
              : 'Conversas que precisam de resposta'
          }
          icon={MessageSquare}
          href="/inbox"
        />
      </div>
      <nav
        aria-label="Áreas do dashboard"
        className="border-border flex gap-5 border-b"
      >
        {(
          [
            { id: 'day', label: 'O meu dia', icon: ListTodo },
            { id: 'reports', label: 'Indicadores', icon: BarChart3 },
            { id: 'activity', label: 'Atividade', icon: History },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => {
              setView(tab.id);
              viewRef.current = tab.id;
              loadAll(range, false, tab.id);
            }}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
              view === tab.id
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </nav>
      {dashboardDataUnavailable ? (
        <div className="border-border bg-card rounded-2xl border p-8 text-center">
          <TriangleAlert className="mx-auto mb-3 size-7 text-amber-600" />
          <h2 className="font-semibold">Não foi possível carregar o painel</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Tente novamente para consultar os dados atuais.
          </p>
          <Button
            className="mt-4"
            onClick={() => loadAll(range)}
            disabled={refreshing}
          >
            Tentar novamente
          </Button>
        </div>
      ) : view === 'day' ? (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
            <DayAgenda
              data={today}
              loading={todayLoading}
              error={Boolean(loadErrors['Operação diária'])}
              onChanged={handleAppointmentChanged}
            />
            <div className="min-w-0 space-y-5">
              <PortalPendingConfirmationsCard
                appointments={portalPending}
                loading={portalPendingLoading}
                error={Boolean(loadErrors['Marcações do Portal 360'])}
                onChanged={handleAppointmentChanged}
              />
              <section className="border-border bg-card overflow-hidden rounded-2xl border">
                <div className="border-border flex items-center justify-between border-b px-5 py-4">
                  <h2 className="text-base font-semibold">
                    Precisa de atenção
                  </h2>
                  <Link
                    href="/inbox"
                    className="text-primary text-xs font-semibold"
                  >
                    Abrir inbox ↗
                  </Link>
                </div>
                <div className="divide-border divide-y">
                  <Attention
                    href="/inbox"
                    label="Conversas sem responsável"
                    value={
                      inboxOpsLoading ? '…' : (inboxOps?.unassigned ?? '—')
                    }
                    warning={Boolean(inboxOps?.unassigned)}
                  />
                  <Attention
                    href="/pipelines"
                    label="Negócios sem avanço"
                    value={salesLoading ? '…' : (sales?.stalledDeals ?? '—')}
                    warning={Boolean(sales?.stalledDeals)}
                  />
                  <Attention
                    href="/automations"
                    label="Falhas de automação · 24 h"
                    value={
                      automationLoading
                        ? '…'
                        : (automation?.failedLogs24h ?? '—')
                    }
                    warning={Boolean(automation?.failedLogs24h)}
                  />
                </div>
              </section>
            </div>
          </div>
          <Benefits
            benefits={expiringBenefits}
            loading={expiringBenefitsLoading}
            error={Boolean(loadErrors.Validades)}
          />
          <details
            className="group border-border bg-card rounded-2xl border"
            onToggle={(event) => setFollowUpOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">
              Seguimento de clientes
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                Tarefas e próximas ações
              </span>
            </summary>
            <div className="border-border border-t p-4">
              {followUpOpen && <FollowUpCommandCenter />}
            </div>
          </details>
        </>
      ) : view === 'reports' ? (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Atividade e resultados</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Conversas, vendas e qualidade do atendimento.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ConversationsChart
                series={series}
                loading={seriesLoading}
                range={range}
                onRangeChange={handleRangeChange}
              />
            </div>
            <div className="lg:col-span-2">
              <PipelineDonut
                data={pipeline}
                loading={pipelineLoading}
                currency={defaultCurrency}
              />
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <InboxOperationsPanel data={inboxOps} loading={inboxOpsLoading} />
            <SalesInsightsPanel
              data={sales}
              loading={salesLoading}
              currency={defaultCurrency}
            />
          </div>
          <ResponseTimeChart
            data={responseTime}
            loading={responseTimeLoading}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <AutomationInsightsPanel
              data={automation}
              loading={automationLoading}
            />
            <TeamPerformancePanel data={team} loading={teamLoading} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary
              label="Novos contactos hoje"
              value={
                metricsLoading
                  ? '…'
                  : (metrics?.newContactsToday.current.toLocaleString() ?? '—')
              }
              detail="Clientes adicionados ao CRM"
              icon={CheckCheck}
              href="/contacts"
            />
            <Summary
              label="Mensagens enviadas"
              value={
                metricsLoading
                  ? '…'
                  : (metrics?.messagesSentToday.current.toLocaleString() ?? '—')
              }
              detail="Total de hoje"
              icon={MessageSquare}
              href="/inbox"
            />
            <Summary
              label="Negócios em aberto"
              value={
                metrics
                  ? formatCurrency(metrics.openDealsValue, defaultCurrency)
                  : '—'
              }
              detail={
                metrics
                  ? metrics.openDealsCount + ' oportunidades'
                  : 'Pipeline comercial'
              }
              icon={BarChart3}
              href="/pipelines"
            />
          </div>
        </div>
      ) : (
        <ActivityFeed items={activity} loading={activityLoading} />
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarDays;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group border-border bg-card hover:border-primary/40 rounded-2xl border px-3 py-4 transition-colors sm:px-5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <Icon className="text-muted-foreground size-4" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </Link>
  );
}
function Attention({
  href,
  label,
  value,
  warning,
}: {
  href: string;
  label: string;
  value: string | number;
  warning: boolean;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted/40 flex items-center justify-between gap-3 px-5 py-3.5 text-sm"
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
          warning
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {value}
      </span>
    </Link>
  );
}
function Benefits({
  benefits,
  loading,
  error,
}: {
  benefits: ExpiringBenefitItem[] | null;
  loading: boolean;
  error: boolean;
}) {
  const [now] = useState(() => Date.now());
  return (
    <section className="border-border bg-card rounded-2xl border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Vouchers e packs a vencer</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Acompanhe as validades dos próximos 30 dias.
          </p>
        </div>
        <Link
          href="/finance?tab=vouchers"
          className="text-primary inline-flex items-center gap-1 text-xs font-semibold"
        >
          Ver benefícios
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {loading ? (
        <p className="text-muted-foreground py-4 text-sm">
          A consultar validades…
        </p>
      ) : error ? (
        <p className="text-sm text-amber-700">
          Validades indisponíveis. Atualize o painel para tentar novamente.
        </p>
      ) : benefits?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {benefits.slice(0, 4).map((benefit) => {
            const Icon = benefit.type === 'voucher' ? Gift : PackageCheck;
            const days = Math.max(
              0,
              Math.ceil(
                (new Date(benefit.expiresAt).getTime() - now) / 86400000
              )
            );
            return (
              <Link
                key={benefit.type + benefit.id}
                href={'/contacts/' + benefit.contactId + '?tab=benefits'}
                className="border-border hover:border-primary/40 rounded-xl border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="text-muted-foreground size-4" />
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {days === 0 ? 'Hoje' : days + ' dias'}
                  </span>
                </div>
                <p className="mt-3 truncate text-sm font-semibold">
                  {benefit.contactName}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">
                  {benefit.label}
                </p>
                <p className="mt-2 text-xs font-medium">
                  {benefit.remainingLabel}
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground bg-muted/40 rounded-xl px-4 py-5 text-sm">
          Sem vouchers ou packs a vencer nos próximos 30 dias.
        </p>
      )}
    </section>
  );
}

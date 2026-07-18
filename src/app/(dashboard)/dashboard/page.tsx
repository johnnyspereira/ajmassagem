'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';

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
} from '@/lib/dashboard/types';

import { MetricCard } from '@/components/dashboard/metric-card';
import { SkeletonCard } from '@/components/dashboard/skeleton';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { ConversationsChart } from '@/components/dashboard/conversations-chart';
import { PipelineDonut } from '@/components/dashboard/pipeline-donut';
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { TodayOperationsPanel } from '@/components/dashboard/today-operations';
import {
  AutomationInsightsPanel,
  DashboardAlertsPanel,
  InboxOperationsPanel,
  SalesInsightsPanel,
  TeamPerformancePanel,
  WhatsAppHealthCard,
} from '@/components/dashboard/operations-panels';
import { cn } from '@/lib/utils';

import { useTranslations } from 'next-intl';

type RangeDays = 7 | 30 | 90;

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page');
  const { defaultCurrency } = useAuth();
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

  const loadAll = useCallback(
    (rangeToLoad: RangeDays = 30, showLoading = true) => {
      const db = createClient();
      if (showLoading) {
        setRefreshing(true);
        setMetricsLoading(true);
        setSeriesLoading(true);
        setPipelineLoading(true);
        setResponseTimeLoading(true);
        setActivityLoading(true);
        setWhatsAppLoading(true);
        setInboxOpsLoading(true);
        setSalesLoading(true);
        setAutomationLoading(true);
        setTeamLoading(true);
        setTodayLoading(true);
      }
      setLoadErrors({});

      const recordFailure = (key: string, error: unknown) => {
        console.error(`[dashboard] ${key} failed:`, error);
        setLoadErrors((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : 'Falha ao carregar',
        }));
      };

      // Kick everything off in parallel. Each block has its own
      // setState + finally so a slow query doesn't hold up faster
      // sections — each widget shows its own skeleton independently.
      const tasks = [
        loadMetrics(db)
          .then((m) => setMetrics(m))
          .catch((err) => recordFailure('Indicadores', err))
          .finally(() => setMetricsLoading(false)),

        loadConversationsSeries(db, rangeToLoad)
          .then((s) => setSeries((prev) => ({ ...prev, [rangeToLoad]: s })))
          .catch((err) => recordFailure('Conversas', err))
          .finally(() => setSeriesLoading(false)),

        loadPipelineDonut(db)
          .then((p) => setPipeline(p))
          .catch((err) => recordFailure('Pipeline', err))
          .finally(() => setPipelineLoading(false)),

        loadResponseTime(db)
          .then((r) => setResponseTime(r))
          .catch((err) => recordFailure('Tempo de resposta', err))
          .finally(() => setResponseTimeLoading(false)),

        // Fetch up to 50 so the biggest page-size option in the feed
        // (50 rows) is already in memory — switching sizes then becomes
        // a pure client-side slice with no extra round trip.
        loadActivity(db, 50)
          .then((a) => setActivity(a))
          .catch((err) => recordFailure('Atividade', err))
          .finally(() => setActivityLoading(false)),

        loadWhatsAppHealth(db)
          .then((w) => setWhatsApp(w))
          .catch((err) => recordFailure('WhatsApp', err))
          .finally(() => setWhatsAppLoading(false)),

        loadInboxOperations(db)
          .then((ops) => setInboxOps(ops))
          .catch((err) => recordFailure('Inbox', err))
          .finally(() => setInboxOpsLoading(false)),

        loadSalesInsights(db)
          .then((s) => setSales(s))
          .catch((err) => recordFailure('Comercial', err))
          .finally(() => setSalesLoading(false)),

        loadAutomationInsights(db)
          .then((a) => setAutomation(a))
          .catch((err) => recordFailure('Automações', err))
          .finally(() => setAutomationLoading(false)),

        loadTeamPerformance(db)
          .then((performance) => setTeam(performance))
          .catch((err) => recordFailure('Equipa', err))
          .finally(() => setTeamLoading(false)),
        loadTodayOperations(db)
          .then((operations) => setToday(operations))
          .catch((err) => recordFailure('Operação diária', err))
          .finally(() => setTodayLoading(false)),
      ];

      void Promise.allSettled(tasks).finally(() => {
        setRefreshing(false);
        setLastUpdatedAt(new Date());
      });
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
    }, 60_000);
    return () => window.clearInterval(timer);
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAll(range)}
          disabled={refreshing}
          className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          {t('refresh')}
        </button>
      </div>

      {Object.keys(loadErrors).length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Alguns dados não foram atualizados</p>
              <p className="text-muted-foreground text-xs">
                {Object.keys(loadErrors).join(', ')}. Os restantes módulos
                continuam disponíveis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadAll(range)}
            className="text-primary text-xs font-semibold hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {lastUpdatedAt ? (
        <p className="text-muted-foreground -mt-3 text-right text-[11px]">
          Atualizado às{' '}
          {lastUpdatedAt.toLocaleTimeString('pt-PT', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DashboardAlertsPanel
            whatsapp={whatsapp}
            inbox={inboxOps}
            sales={sales}
            automation={automation}
            loading={
              whatsappLoading ||
              inboxOpsLoading ||
              salesLoading ||
              automationLoading
            }
          />
        </div>
        <WhatsAppHealthCard data={whatsapp} loading={whatsappLoading} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : metrics ? (
          <>
            <MetricCard
              title={t('activeConversations')}
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              href="/inbox"
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(
                  metrics.activeConversations.previous,
                  t('newTodayVsYesterday'),
                  t('noChange', { suffix: t('newTodayVsYesterday') })
                ),
              }}
            />
            <MetricCard
              title={t('newContactsToday')}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              href="/contacts"
              delta={{
                sign:
                  metrics.newContactsToday.current -
                  metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current -
                    metrics.newContactsToday.previous,
                  t('vsYesterday'),
                  t('noChange', { suffix: t('vsYesterday') })
                ),
              }}
            />
            <MetricCard
              title={t('openDealsValue')}
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              href="/pipelines"
              subtitle={t('openDeals', { count: metrics.openDealsCount })}
            />
            <MetricCard
              title={t('messagesSentToday')}
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              href="/inbox"
              delta={{
                sign:
                  metrics.messagesSentToday.current -
                  metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current -
                    metrics.messagesSentToday.previous,
                  t('vsYesterday'),
                  t('noChange', { suffix: t('vsYesterday') })
                ),
              }}
            />
          </>
        ) : (
          <div className="border-border text-muted-foreground col-span-full rounded-lg border px-5 py-10 text-center text-sm">
            Indicadores indisponíveis. Atualize o Dashboard para tentar
            novamente.
          </div>
        )}
      </div>

      <TodayOperationsPanel
        data={today}
        loading={todayLoading}
        currency={defaultCurrency}
        error={Boolean(loadErrors['Operação diária'])}
      />

      {/* Quick actions */}
      <QuickActions />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <InboxOperationsPanel data={inboxOps} loading={inboxOpsLoading} />
        </div>
        <SalesInsightsPanel
          data={sales}
          loading={salesLoading}
          currency={defaultCurrency}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AutomationInsightsPanel
          data={automation}
          loading={automationLoading}
        />
        <div className="xl:col-span-2">
          <TeamPerformancePanel data={team} loading={teamLoading} />
        </div>
      </div>

      {/* Charts row */}
      {/* items-stretch (the grid default) stretches the two columns to
          match the tallest sibling; adding h-full on each wrapper and
          on the inner panels makes both cards actually fill that
          stretched height so their rounded borders line up. Without
          this, the pipeline card rendered at its natural (shorter)
          height while the line chart drove the row height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  );
}

// ------------------------------------------------------------

function deltaLabel(
  delta: number,
  suffix: string,
  noChangeLabel: string
): string {
  if (delta === 0) return noChangeLabel;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toLocaleString()} ${suffix}`;
}

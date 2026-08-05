'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  Link2,
  Loader2,
  PlugZap,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import type { ClinicProduct, FinanceInvoiceRequest, FinanceSale } from '@/types';

type IntegrationSetting = {
  id: string;
  account_id: string;
  category: 'fiscal' | 'payments' | 'ads' | 'email' | 'booking_ai';
  provider: string;
  status: 'not_configured' | 'configured' | 'active' | 'paused' | 'error';
  display_name: string;
  config: Record<string, unknown>;
  last_error: string | null;
  connected_at: string | null;
};

type PaymentLink = {
  id: string;
  provider: string;
  status: 'draft' | 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
  amount: number;
  currency: string;
  description: string | null;
  payment_url: string | null;
  created_at: string;
};

type ProductWithStock = ClinicProduct & {
  low_stock_threshold?: number;
  supplier_name?: string | null;
  supplier_reference?: string | null;
  cost_price?: number;
};

const PROVIDERS = [
  {
    category: 'fiscal',
    provider: 'vendus',
    displayName: 'Vendus / Cegid',
    detail: 'Faturação certificada, documentos fiscais e preparação SAF-T.',
  },
  {
    category: 'fiscal',
    provider: 'manual_fiscal',
    displayName: 'Faturação manual',
    detail: 'Usar enquanto a integração certificada não estiver ligada.',
  },
  {
    category: 'payments',
    provider: 'easypay',
    displayName: 'Easypay',
    detail: 'MB Way, Referência Multibanco e reconciliação automática.',
  },
  {
    category: 'payments',
    provider: 'stripe',
    displayName: 'Stripe',
    detail: 'Cartão, Apple Pay/Google Pay e links de pagamento online.',
  },
  {
    category: 'email',
    provider: 'brevo',
    displayName: 'Brevo',
    detail: 'Newsletters, sincronização de segmentos e consentimentos RGPD.',
  },
  {
    category: 'ads',
    provider: 'meta_google_ads',
    displayName: 'Meta/Google Ads',
    detail: 'Conversões de leads, marcações e vendas para otimizar anúncios.',
  },
  {
    category: 'booking_ai',
    provider: 'booking_ai',
    displayName: 'IA de agendamento',
    detail: 'Agente com acesso a serviços, horários, preços e base de conhecimento.',
  },
] as const;

const STATUS_LABEL: Record<IntegrationSetting['status'], string> = {
  not_configured: 'Por configurar',
  configured: 'Configurado',
  active: 'Ativo',
  paused: 'Pausado',
  error: 'Erro',
};

function statusClass(status: IntegrationSetting['status']) {
  if (status === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
  if (status === 'configured') return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-500';
  return 'border-muted bg-muted text-muted-foreground';
}

export function BusinessHubPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, user, defaultCurrency, canEditSettings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSetting[]>([]);
  const [sales, setSales] = useState<FinanceSale[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<FinanceInvoiceRequest[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const [integrationsRes, salesRes, invoiceRequestsRes, linksRes, productsRes] =
      await Promise.all([
        supabase
          .from('business_integration_settings')
          .select('*')
          .eq('account_id', accountId),
        supabase
          .from('finance_sales')
          .select('*, contact:contacts(id,name,phone), invoice_request:finance_invoice_requests(*)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase
          .from('finance_invoice_requests')
          .select('*, sale:finance_sales(*), contact:contacts(*)')
          .eq('account_id', accountId)
          .order('requested_at', { ascending: false })
          .limit(30),
        supabase
          .from('finance_payment_links')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('clinic_products')
          .select('*')
          .eq('account_id', accountId)
          .eq('is_active', true)
          .order('stock_quantity', { ascending: true })
          .limit(80),
      ]);

    if (integrationsRes.error && integrationsRes.error.code !== '42P01') {
      toast.error(integrationsRes.error.message);
    }
    setIntegrations((integrationsRes.data as IntegrationSetting[] | null) ?? []);
    setSales((salesRes.data as FinanceSale[] | null) ?? []);
    setInvoiceRequests((invoiceRequestsRes.data as FinanceInvoiceRequest[] | null) ?? []);
    setPaymentLinks((linksRes.data as PaymentLink[] | null) ?? []);
    setProducts((productsRes.data as ProductWithStock[] | null) ?? []);
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const providerMap = new Map(
    integrations.map((item) => [`${item.category}:${item.provider}`, item])
  );
  const unpaidSales = sales.filter((sale) => Number(sale.balance_due ?? 0) > 0);
  const salesWithoutInvoice = sales.filter(
    (sale) => sale.status !== 'voided' && !sale.invoice_request
  );
  const lowStockProducts = products.filter(
    (product) =>
      Number(product.stock_quantity ?? 0) <=
      Number(product.low_stock_threshold ?? 3)
  );
  const outOfStockProducts = products.filter(
    (product) => Number(product.stock_quantity ?? 0) <= 0
  );

  async function configureProvider(
    category: IntegrationSetting['category'],
    provider: string,
    displayName: string
  ) {
    if (!accountId || !user?.id || !canEditSettings) return;
    setSavingProvider(`${category}:${provider}`);
    const { error } = await supabase.from('business_integration_settings').upsert(
      {
        account_id: accountId,
        category,
        provider,
        display_name: displayName,
        status: 'configured',
        config: {
          notes: notes[`${category}:${provider}`] || '',
          configured_by: user.id,
        },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,category,provider' }
    );
    setSavingProvider(null);
    if (error) return toast.error(error.message);
    toast.success(`${displayName} ficou marcado como configurado.`);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-6" />
            <h1 className="text-foreground text-2xl font-bold">Gestão Zappy-like</h1>
          </div>
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
            Central para fechar as lacunas contra a Zappy: faturação fiscal,
            pagamentos eletrónicos, stock, anúncios, email marketing e IA de agendamento.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileText}
          label="Vendas sem fatura"
          value={salesWithoutInvoice.length}
          detail="prontas para emissão fiscal"
        />
        <KpiCard
          icon={CreditCard}
          label="Valores a receber"
          value={formatCurrency(
            unpaidSales.reduce((sum, sale) => sum + Number(sale.balance_due ?? 0), 0),
            defaultCurrency
          )}
          detail={`${unpaidSales.length} venda(s) pendente(s)`}
        />
        <KpiCard
          icon={Boxes}
          label="Stock baixo"
          value={lowStockProducts.length}
          detail={`${outOfStockProducts.length} produto(s) esgotado(s)`}
        />
        <KpiCard
          icon={PlugZap}
          label="Integrações ativas"
          value={integrations.filter((item) => item.status === 'active').length}
          detail={`${integrations.length} fornecedor(es) configurados`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 /> Fornecedores e integrações
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {PROVIDERS.map((provider) => {
              const key = `${provider.category}:${provider.provider}`;
              const configured = providerMap.get(key);
              return (
                <div key={key} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{provider.displayName}</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {provider.detail}
                      </p>
                    </div>
                    <Badge className={statusClass(configured?.status ?? 'not_configured')}>
                      {STATUS_LABEL[configured?.status ?? 'not_configured']}
                    </Badge>
                  </div>
                  <Textarea
                    value={notes[key] ?? String(configured?.config?.notes ?? '')}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [key]: event.target.value }))
                    }
                    placeholder="Notas, credenciais recebidas ou próximos passos internos"
                    rows={3}
                    className="mt-3"
                    disabled={!canEditSettings}
                  />
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={!canEditSettings || savingProvider === key}
                    onClick={() =>
                      configureProvider(
                        provider.category,
                        provider.provider,
                        provider.displayName
                      )
                    }
                  >
                    {savingProvider === key ? (
                      <Loader2 className="animate-spin" />
                    ) : configured ? (
                      <BadgeCheck />
                    ) : (
                      <PlugZap />
                    )}
                    {configured ? 'Atualizar configuração' : 'Marcar como configurado'}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle /> Próximas ações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionRow
              done={Boolean(providerMap.get('fiscal:vendus') || providerMap.get('fiscal:manual_fiscal'))}
              title="Escolher fornecedor fiscal"
              detail="Vendus/Cegid, Moloni, InvoiceXpress ou fluxo manual."
            />
            <ActionRow
              done={Boolean(providerMap.get('payments:easypay') || providerMap.get('payments:stripe'))}
              title="Escolher pagamentos online"
              detail="MB Way/Multibanco/cartão para links de pagamento."
            />
            <ActionRow
              done={lowStockProducts.length === 0}
              title="Resolver stock crítico"
              detail={`${lowStockProducts.length} produto(s) abaixo do mínimo.`}
            />
            <ActionRow
              done={salesWithoutInvoice.length === 0}
              title="Emitir documentos fiscais"
              detail={`${salesWithoutInvoice.length} venda(s) ainda sem pedido/documento.`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText /> Faturação fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataList
              empty="Nenhuma venda recente sem fatura."
              rows={salesWithoutInvoice.slice(0, 8).map((sale) => ({
                id: sale.id,
                title: `Venda #${sale.sale_number}`,
                detail: `${sale.contact?.name || sale.contact?.phone || 'Cliente'} · ${new Date(sale.created_at).toLocaleDateString('pt-PT')}`,
                amount: formatCurrency(Number(sale.total_amount), sale.currency),
              }))}
            />
            <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Pedidos de fatura no portal</p>
              <p className="text-muted-foreground mt-1">
                {invoiceRequests.filter((item) => item.status === 'pending').length}{' '}
                pedido(s) pendente(s) para tratar.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard /> Pagamentos eletrónicos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataList
              empty="Ainda não existem links de pagamento."
              rows={paymentLinks.slice(0, 8).map((link) => ({
                id: link.id,
                title: link.description || `Link ${link.provider}`,
                detail: `${link.status} · ${new Date(link.created_at).toLocaleDateString('pt-PT')}`,
                amount: formatCurrency(Number(link.amount), link.currency),
              }))}
            />
            <div className="mt-4 rounded-lg border border-dashed p-3 text-sm">
              <p className="font-medium">Preparado para integração</p>
              <p className="text-muted-foreground mt-1">
                A tabela de links já está pronta para Easypay, Stripe ou outro fornecedor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes /> Gestão de stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lowStockProducts.slice(0, 12).map((product) => (
                <div key={product.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {product.sku || 'Sem SKU'} · mínimo {product.low_stock_threshold ?? 3}
                      </p>
                    </div>
                    <Badge
                      variant={Number(product.stock_quantity) <= 0 ? 'destructive' : 'outline'}
                    >
                      {Number(product.stock_quantity) <= 0 ? 'Esgotado' : 'Baixo'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <MiniStat label="Stock" value={String(product.stock_quantity)} />
                    <MiniStat
                      label="Preço"
                      value={formatCurrency(Number(product.price), product.currency)}
                    />
                    <MiniStat
                      label="Custo"
                      value={formatCurrency(Number(product.cost_price ?? 0), product.currency)}
                    />
                    <MiniStat label="Fornecedor" value={product.supplier_name || '—'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed text-center">
              <CheckCircle2 className="text-emerald-500 mb-2 size-7" />
              <p className="font-medium">Stock saudável</p>
              <p className="text-muted-foreground text-sm">
                Nenhum produto ativo está abaixo do limite mínimo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="bg-primary/10 text-primary rounded-xl p-3">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-muted-foreground text-xs">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionRow({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <span
        className={
          done
            ? 'text-emerald-500'
            : 'text-amber-500'
        }
      >
        {done ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{detail}</p>
      </div>
    </div>
  );
}

function DataList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; title: string; detail: string; amount: string }>;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed text-center">
        <Banknote className="text-muted-foreground mb-2 size-7" />
        <p className="text-muted-foreground text-sm">{empty}</p>
      </div>
    );
  }
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.title}</p>
            <p className="text-muted-foreground truncate text-sm">{row.detail}</p>
          </div>
          <strong className="shrink-0">{row.amount}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="truncate font-semibold">{value}</p>
    </div>
  );
}

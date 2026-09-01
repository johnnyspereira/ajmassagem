'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Gift,
  MailCheck,
  MailWarning,
  PackageCheck,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { FinanceClientPack, FinanceVoucher } from '@/types';

type DeliveryNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
  metadata?: {
    saleId?: string;
    sent?: number;
    skipped?: number;
    failures?: string[];
  } | null;
};

export function BenefitsReportPage() {
  const db = useMemo(() => createClient(), []);
  const { accountId, user } = useAuth();
  const [packs, setPacks] = useState<FinanceClientPack[]>([]);
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryNotification[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
        .select('id,type,title,body,created_at,metadata')
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
    if (error) toast.error(`Falha ao carregar relatório: ${error.message}`);
    else {
      setPacks((packResult.data ?? []) as FinanceClientPack[]);
      setVouchers((voucherResult.data ?? []) as FinanceVoucher[]);
      setDeliveries((deliveryResult.data ?? []) as DeliveryNotification[]);
    }
    setLoading(false);
  }, [accountId, db, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const filteredPacks = packs.filter((item) =>
    [
      item.contact?.name,
      item.contact?.email,
      item.contact?.phone,
      item.pack?.name,
      item.code,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term))
  );
  const filteredVouchers = vouchers.filter((item) =>
    [
      item.owner?.name,
      item.owner?.email,
      item.owner?.phone,
      item.code,
      item.recipient_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term))
  );
  const activePacks = packs.filter((item) => item.status === 'active');
  const remainingSessions = activePacks.reduce(
    (sum, item) =>
      sum +
      (item.balances ?? []).reduce(
        (balanceSum, balance) =>
          balanceSum + Number(balance.remaining_sessions),
        0
      ),
    0
  );
  const activeVouchers = vouchers.filter((item) => item.status === 'active');

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Packs e vouchers</h1>
          <p className="text-muted-foreground text-sm">
            Saldos, validade, clientes e histórico de entrega num só relatório.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Atualizar
          </Button>
          <Link className={buttonVariants()} href="/finance?tab=pos">
            Abrir POS
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={PackageCheck}
          label="Packs ativos"
          value={activePacks.length}
        />
        <Metric
          icon={PackageCheck}
          label="Sessões disponíveis"
          value={remainingSessions}
        />
        <Metric
          icon={Gift}
          label="Vouchers ativos"
          value={activeVouchers.length}
        />
        <Metric
          icon={MailCheck}
          label="Entregas registadas"
          value={deliveries.length}
        />
      </div>

      <div className="relative max-w-xl">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar cliente, telefone, email ou código..."
        />
      </div>

      <Tabs defaultValue="packs">
        <TabsList>
          <TabsTrigger value="packs">
            Packs ({filteredPacks.length})
          </TabsTrigger>
          <TabsTrigger value="vouchers">
            Vouchers ({filteredVouchers.length})
          </TabsTrigger>
          <TabsTrigger value="deliveries">
            Entregas ({deliveries.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="packs" className="space-y-2">
          {filteredPacks.map((item) => {
            const total = (item.balances ?? []).reduce(
              (sum, row) => sum + Number(row.total_sessions),
              0
            );
            const remaining = (item.balances ?? []).reduce(
              (sum, row) => sum + Number(row.remaining_sessions),
              0
            );
            return (
              <ReportRow
                key={item.id}
                title={item.contact?.name || 'Cliente sem nome'}
                subtitle={`${item.pack?.name || 'Pack'} · ${remaining}/${total} sessões disponíveis`}
                code={`${item.code || 'Sem código'} · PIN ${item.pin_code || '—'}`}
                status={item.status}
                date={item.expires_at}
                contactId={item.contact_id}
              />
            );
          })}
        </TabsContent>
        <TabsContent value="vouchers" className="space-y-2">
          {filteredVouchers.map((item) => (
            <ReportRow
              key={item.id}
              title={
                item.owner?.name || item.recipient_name || 'Sem destinatário'
              }
              subtitle={`${item.service?.name || `${Number(item.current_balance).toFixed(2)} ${item.currency}`} · saldo atual`}
              code={`${item.code} · PIN ${item.pin_code || '—'}`}
              status={item.status}
              date={item.expires_at}
              contactId={item.owner_contact_id}
            />
          ))}
        </TabsContent>
        <TabsContent value="deliveries" className="space-y-2">
          {deliveries.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-start gap-3 p-4">
                {item.type.endsWith('_failed') ? (
                  <MailWarning className="mt-0.5 size-5 text-red-500" />
                ) : (
                  <MailCheck className="mt-0.5 size-5 text-emerald-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground text-sm">{item.body}</p>
                </div>
                <time className="text-muted-foreground text-xs">
                  {new Date(item.created_at).toLocaleString('pt-PT')}
                </time>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="text-primary size-5" />
      </CardHeader>
      <CardContent>
        <strong className="text-2xl">{value}</strong>
      </CardContent>
    </Card>
  );
}

function ReportRow(input: {
  title: string;
  subtitle: string;
  code: string;
  status: string;
  date?: string | null;
  contactId?: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <p className="font-medium">{input.title}</p>
          <p className="text-muted-foreground text-sm">{input.subtitle}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {input.code}
          </p>
        </div>
        <div className="text-right">
          <Badge variant="secondary">{input.status}</Badge>
          <p className="text-muted-foreground mt-1 text-xs">
            {input.date
              ? `Validade ${new Date(input.date).toLocaleDateString('pt-PT')}`
              : 'Sem validade'}
          </p>
        </div>
        {input.contactId ? (
          <Link
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={`/contacts/${input.contactId}`}
          >
            Ver cliente
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

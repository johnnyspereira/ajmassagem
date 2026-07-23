'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeEuro,
  Banknote,
  Box,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileClock,
  Gift,
  History,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Loader2,
  Minus,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { formatCurrency } from '@/lib/currency';
import { downloadVoucherPdf } from '@/lib/finance/voucher-pdf';
import { downloadReceiptPdf } from '@/lib/finance/receipt-pdf';
import { OwnerTreasury } from '@/components/finance/owner-treasury';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  ClinicProduct,
  ClinicService,
  Contact,
  FinanceCashSession,
  FinanceBenefitLog,
  FinanceCashMovement,
  FinanceCashSnapshot,
  FinanceClientPack,
  FinanceItemType,
  FinanceInvoiceRequest,
  FinancePackCatalog,
  FinancePaymentMethod,
  FinanceSale,
  FinanceVoucher,
} from '@/types';

type CartItem = {
  key: string;
  itemType: FinanceItemType;
  sourceId?: string;
  name: string;
  reference?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  metadata?: Record<string, unknown>;
};

type PaymentDraft = {
  id: string;
  method: FinancePaymentMethod;
  amount: number;
  referenceCode: string;
  pinCode: string;
};

type CatalogItem = {
  id: string;
  type: 'service' | 'product' | 'pack';
  name: string;
  reference?: string | null;
  price: number;
  detail: string;
  available?: boolean;
};

const PAYMENT_METHODS: Array<{ value: FinancePaymentMethod; label: string }> = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'card', label: 'Cartão' },
  { value: 'mb_way', label: 'MB Way' },
  { value: 'multibanco', label: 'Multibanco' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'client_credit', label: 'Crédito do cliente' },
  { value: 'other', label: 'Outro' },
];

const REGISTER_METHODS = PAYMENT_METHODS.filter(
  (method) => !['voucher', 'client_credit'].includes(method.value)
);

function paymentMethodLabel(method: string) {
  return PAYMENT_METHODS.find((item) => item.value === method)?.label || method;
}

const SALE_STATUS: Record<string, string> = {
  open: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Paga',
  voided: 'Anulada',
  refunded: 'Reembolsada',
};

function money(value: number, currency: string) {
  return formatCurrency(Number(value || 0), currency);
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function randomPin() {
  return String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  ).padStart(6, '0');
}

function isMissingFinanceSchema(error: { code?: string; message?: string }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('finance_') ||
    error.message?.includes('create_finance_sale')
  );
}

export function FinancePage({
  initialContactId = '',
  initialAppointmentId = '',
  initialTab = '',
}: {
  initialContactId?: string;
  initialAppointmentId?: string;
  initialTab?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const {
    accountId,
    user,
    account,
    defaultCurrency,
    profileLoading,
    canEditSettings,
    isOwner,
  } = useAuth();
  const canOperate = useCan('send-messages');

  const [activeTab, setActiveTab] = useState(
    [
      'overview',
      'sales',
      'cash',
      'packs',
      'vouchers',
      'invoices',
      'treasury',
      'pos',
    ].includes(initialTab)
      ? initialTab
      : initialAppointmentId
        ? 'pos'
        : 'overview'
  );
  const [catalogMode, setCatalogMode] = useState<
    'services' | 'products' | 'packs'
  >('services');
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<ClinicService[]>([]);
  const [products, setProducts] = useState<ClinicProduct[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [packs, setPacks] = useState<FinancePackCatalog[]>([]);
  const [sales, setSales] = useState<FinanceSale[]>([]);
  const [invoiceRequests, setInvoiceRequests] = useState<
    FinanceInvoiceRequest[]
  >([]);
  const [cashSession, setCashSession] = useState<FinanceCashSession | null>(
    null
  );
  const [cashSessions, setCashSessions] = useState<FinanceCashSession[]>([]);
  const [cashMovements, setCashMovements] = useState<FinanceCashMovement[]>([]);
  const [cashSnapshot, setCashSnapshot] = useState<FinanceCashSnapshot | null>(
    null
  );
  const [vouchers, setVouchers] = useState<FinanceVoucher[]>([]);
  const [clientPacks, setClientPacks] = useState<FinanceClientPack[]>([]);
  const [benefitLogs, setBenefitLogs] = useState<FinanceBenefitLog[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [contactId, setContactId] = useState(initialContactId);
  const [clientWalletBalance, setClientWalletBalance] = useState(0);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [checkoutAppointmentLabel, setCheckoutAppointmentLabel] = useState('');
  const checkoutLoadedRef = useRef(false);

  const [cashOpen, setCashOpen] = useState(false);
  const [cashCloseOpen, setCashCloseOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingAmount, setClosingAmount] = useState(0);
  const [closingBreakdown, setClosingBreakdown] = useState<
    Partial<Record<FinancePaymentMethod, number>>
  >({});
  const [cashNotes, setCashNotes] = useState('');
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<
    'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
  >('expense');
  const [cashMovementMethod, setCashMovementMethod] =
    useState<FinancePaymentMethod>('cash');
  const [cashMovementCategory, setCashMovementCategory] = useState('');
  const [cashMovementAmount, setCashMovementAmount] = useState(0);
  const [cashMovementDescription, setCashMovementDescription] = useState('');
  const [cashMovementReference, setCashMovementReference] = useState('');
  const [editingCashMovement, setEditingCashMovement] =
    useState<FinanceCashMovement | null>(null);
  const [deletingCashMovement, setDeletingCashMovement] =
    useState<FinanceCashMovement | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(0);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherValue, setVoucherValue] = useState(50);
  const [voucherType, setVoucherType] = useState<'gift_card' | 'service'>(
    'gift_card'
  );
  const [voucherServiceId, setVoucherServiceId] = useState('');
  const [voucherPin, setVoucherPin] = useState(() => randomPin());
  const [voucherRecipient, setVoucherRecipient] = useState('');
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherValidity, setVoucherValidity] = useState(365);

  const [paymentSale, setPaymentSale] = useState<FinanceSale | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [laterPaymentMethod, setLaterPaymentMethod] =
    useState<FinancePaymentMethod>('card');
  const [laterPaymentAmount, setLaterPaymentAmount] = useState(0);
  const [laterReference, setLaterReference] = useState('');
  const [laterPin, setLaterPin] = useState('');
  const [reverseSale, setReverseSale] = useState<FinanceSale | null>(null);
  const [reverseMode, setReverseMode] = useState<'void' | 'refund'>('void');
  const [reverseReason, setReverseReason] = useState('');

  const loadFinance = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setSchemaMissing(false);
    const [
      servicesRes,
      productsRes,
      contactsRes,
      packsRes,
      salesRes,
      cashRes,
      sessionsRes,
      vouchersRes,
      clientPacksRes,
      logsRes,
      movementsRes,
      invoiceRequestsRes,
    ] = await Promise.all([
      supabase
        .from('clinic_services')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('clinic_products')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .order('name')
        .limit(1000),
      supabase
        .from('finance_pack_catalog')
        .select('*, items:finance_pack_items(*, service:clinic_services(*))')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('finance_sales')
        .select(
          '*, contact:contacts(*), items:finance_sale_items(*), payments:finance_payments(*)'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(150),
      supabase
        .from('finance_cash_sessions')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'open')
        .maybeSingle(),
      supabase
        .from('finance_cash_sessions')
        .select('*')
        .eq('account_id', accountId)
        .order('opened_at', { ascending: false })
        .limit(30),
      supabase
        .from('finance_vouchers')
        .select('*, owner:contacts(*), service:clinic_services(*)')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false }),
      supabase
        .from('finance_client_packs')
        .select(
          '*, contact:contacts(*), pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(*))'
        )
        .eq('account_id', accountId)
        .order('purchased_at', { ascending: false }),
      supabase
        .from('finance_benefit_logs')
        .select(
          '*, appointment:clinic_appointments(id, scheduled_start, service:clinic_services(name), contact:contacts(name, phone))'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('finance_cash_movements')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('finance_invoice_requests')
        .select('*, sale:finance_sales(*), contact:contacts(*)')
        .eq('account_id', accountId)
        .order('requested_at', { ascending: false })
        .limit(300),
    ]);

    const firstError =
      packsRes.error ??
      salesRes.error ??
      cashRes.error ??
      sessionsRes.error ??
      vouchersRes.error ??
      clientPacksRes.error ??
      logsRes.error ??
      movementsRes.error ??
      invoiceRequestsRes.error;
    if (firstError) {
      if (isMissingFinanceSchema(firstError)) setSchemaMissing(true);
      else toast.error(`Falha ao carregar financeiro: ${firstError.message}`);
      setLoading(false);
      return;
    }
    setServices((servicesRes.data ?? []) as ClinicService[]);
    setProducts((productsRes.data ?? []) as ClinicProduct[]);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setPacks((packsRes.data ?? []) as FinancePackCatalog[]);
    setSales((salesRes.data ?? []) as FinanceSale[]);
    setCashSession((cashRes.data as FinanceCashSession | null) ?? null);
    setCashSessions((sessionsRes.data ?? []) as FinanceCashSession[]);
    setVouchers((vouchersRes.data ?? []) as FinanceVoucher[]);
    setClientPacks((clientPacksRes.data ?? []) as FinanceClientPack[]);
    setBenefitLogs((logsRes.data ?? []) as FinanceBenefitLog[]);
    setCashMovements((movementsRes.data ?? []) as FinanceCashMovement[]);
    setInvoiceRequests(
      (invoiceRequestsRes.data ?? []) as FinanceInvoiceRequest[]
    );
    if (cashRes.data?.id) {
      const { data: snapshot, error: snapshotError } = await supabase.rpc(
        'get_finance_register_snapshot',
        { p_cash_session_id: cashRes.data.id }
      );
      if (snapshotError) {
        if (isMissingFinanceSchema(snapshotError)) setSchemaMissing(true);
        else toast.error(`Falha ao conferir caixa: ${snapshotError.message}`);
        setCashSnapshot(null);
      } else {
        setCashSnapshot(snapshot as FinanceCashSnapshot);
      }
    } else {
      setCashSnapshot(null);
    }
    setLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    if (profileLoading) return;
    // Loading is intentionally tied to the authenticated workspace becoming ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFinance();
  }, [loadFinance, profileLoading]);

  useEffect(() => {
    if (!accountId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadFinance(), 350);
    };
    const channel = supabase
      .channel(`finance-live-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_sales',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_payments',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_cash_sessions',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_cash_movements',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_invoice_requests',
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh
      )
      .subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [accountId, loadFinance, supabase]);

  useEffect(() => {
    if (!accountId || !contactId) {
      // Reset the amount when the POS switches back to an anonymous sale.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientWalletBalance(0);
      return;
    }
    let cancelled = false;
    void supabase
      .from('finance_client_wallets')
      .select('balance, currency')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .then(({ data }) => {
        if (cancelled) return;
        setClientWalletBalance(
          (data ?? [])
            .filter((wallet) => wallet.currency === defaultCurrency)
            .reduce((sum, wallet) => sum + Number(wallet.balance), 0)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, contactId, defaultCurrency, supabase]);

  useEffect(() => {
    if (!accountId || !initialAppointmentId || checkoutLoadedRef.current)
      return;
    checkoutLoadedRef.current = true;
    void supabase
      .from('clinic_appointments')
      .select(
        'id, contact_id, price, original_price, referral_id, referral_discount_amount, currency, scheduled_start, service:clinic_services(id, name, reference)'
      )
      .eq('account_id', accountId)
      .eq('id', initialAppointmentId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('Não foi possível preparar a marcação no POS.');
          return;
        }
        const service = Array.isArray(data.service)
          ? data.service[0]
          : data.service;
        if (!service) {
          toast.error('A marcação não possui um serviço válido.');
          return;
        }
        setContactId(data.contact_id ?? initialContactId);
        setCart([
          {
            key: `appointment-${data.id}`,
            itemType: 'service',
            sourceId: service.id,
            name: service.name,
            reference: service.reference ?? undefined,
            quantity: 1,
            unitPrice: Number(data.original_price ?? data.price ?? 0),
            discountAmount: Number(data.referral_discount_amount ?? 0),
            taxRate: 0,
            metadata: {
              appointment_id: data.id,
              referral_id: data.referral_id,
              referral_discount_amount: Number(
                data.referral_discount_amount ?? 0
              ),
            },
          },
        ]);
        setSaleNotes(`Pagamento da marcação ${data.id}`);
        setCheckoutAppointmentLabel(
          `${service.name} · ${new Date(data.scheduled_start).toLocaleString('pt-PT')}`
        );
        setActiveTab('pos');
      });
  }, [accountId, initialAppointmentId, initialContactId, supabase]);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const itemDiscount = cart.reduce((sum, item) => sum + item.discountAmount, 0);
  const tax = cart.reduce((sum, item) => {
    const base = Math.max(
      item.quantity * item.unitPrice - item.discountAmount,
      0
    );
    return sum + (base * item.taxRate) / 100;
  }, 0);
  const total = Math.max(subtotal - itemDiscount - saleDiscount + tax, 0);
  const paidNow = payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );
  const remaining = Math.max(total - paidNow, 0);
  const financeMetrics = useMemo(() => {
    const operational = sales.filter(
      (sale) => !['voided', 'refunded'].includes(sale.status)
    );
    return {
      billed: operational.reduce(
        (sum, sale) => sum + Number(sale.total_amount),
        0
      ),
      received: operational.reduce(
        (sum, sale) => sum + Number(sale.paid_amount),
        0
      ),
      due: operational.reduce((sum, sale) => sum + Number(sale.balance_due), 0),
      openSales: operational.filter((sale) => Number(sale.balance_due) > 0)
        .length,
    };
  }, [sales]);

  const catalog = useMemo<CatalogItem[]>(() => {
    const term = search.trim().toLocaleLowerCase();
    if (catalogMode === 'products') {
      return products
        .filter(
          (item) =>
            !term ||
            `${item.name} ${item.sku ?? ''}`.toLocaleLowerCase().includes(term)
        )
        .map((item) => ({
          id: item.id,
          type: 'product' as const,
          name: item.name,
          reference: item.sku,
          price: Number(item.price),
          detail: `${item.stock_quantity} em stock`,
          available: item.stock_quantity > 0,
        }));
    }
    if (catalogMode === 'packs') {
      return packs
        .filter(
          (item) =>
            item.is_active &&
            (!term ||
              `${item.name} ${item.reference ?? ''}`
                .toLocaleLowerCase()
                .includes(term))
        )
        .map((item) => ({
          id: item.id,
          type: 'pack' as const,
          name: item.name,
          reference: item.reference,
          price: Number(item.price),
          detail: `${item.validity_days} dias`,
        }));
    }
    return services
      .filter(
        (item) =>
          !term ||
          `${item.name} ${item.reference ?? ''}`
            .toLocaleLowerCase()
            .includes(term)
      )
      .map((item) => ({
        id: item.id,
        type: 'service' as const,
        name: item.name,
        reference: item.reference,
        price: Number(item.price),
        detail: `${item.duration_minutes} min`,
      }));
  }, [catalogMode, packs, products, search, services]);

  function addCatalogItem(item: CatalogItem) {
    if (item.available === false) {
      toast.error('Este produto está sem stock.');
      return;
    }
    const key = `${item.type}-${item.id}`;
    setCart((current) => {
      const existing = current.find((entry) => entry.key === key);
      if (existing)
        return current.map((entry) =>
          entry.key === key ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      return [
        ...current,
        {
          key,
          itemType: item.type,
          sourceId: item.id,
          name: item.name,
          reference: item.reference ?? undefined,
          quantity: 1,
          unitPrice: item.price,
          discountAmount: 0,
          taxRate: 0,
        },
      ];
    });
  }

  function updateCart(key: string, patch: Partial<CartItem>) {
    setCart((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function removeCart(key: string) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  function addPayment() {
    const amount = Number(remaining.toFixed(2));
    if (amount <= 0) return;
    setPayments((current) => [
      ...current,
      {
        id: randomId(),
        method: 'card',
        amount,
        referenceCode: '',
        pinCode: '',
      },
    ]);
  }

  function resetSale() {
    setCart([]);
    setContactId('');
    setSaleDiscount(0);
    setSaleNotes('');
    setPayments([]);
  }

  async function finishSale() {
    if (!accountId || !cart.length) return;
    if (
      cart.some(
        (item) =>
          item.quantity <= 0 ||
          item.unitPrice < 0 ||
          item.discountAmount < 0 ||
          item.discountAmount > item.quantity * item.unitPrice ||
          item.taxRate < 0 ||
          item.taxRate > 100
      ) ||
      saleDiscount < 0 ||
      saleDiscount + itemDiscount > subtotal
    ) {
      toast.error('Revise quantidades, impostos e descontos da venda.');
      return;
    }
    if (cart.some((item) => item.itemType === 'pack') && !contactId) {
      toast.error('Selecione um cliente para vender packs.');
      return;
    }
    if (payments.some((payment) => payment.method === 'cash') && !cashSession) {
      toast.error('Abra o caixa antes de receber dinheiro.');
      setCashOpen(true);
      return;
    }
    if (
      payments.some(
        (payment) =>
          payment.method === 'voucher' &&
          (!payment.referenceCode.trim() || !payment.pinCode.trim())
      )
    ) {
      toast.error('Informe o código e o PIN do voucher usado no pagamento.');
      return;
    }
    if (paidNow > total + 0.001) {
      toast.error('Os pagamentos não podem ultrapassar o total.');
      return;
    }
    const walletPayment = payments
      .filter((payment) => payment.method === 'client_credit')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (walletPayment > clientWalletBalance) {
      toast.error('O cartão-saldo do cliente não possui saldo suficiente.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_finance_sale_secure', {
      p_contact_id: contactId || null,
      p_appointment_id: initialAppointmentId || null,
      p_cash_session_id: cashSession?.id ?? null,
      p_currency: defaultCurrency,
      p_items: cart.map((item) => ({
        item_type: item.itemType,
        source_id: item.sourceId ?? null,
        name: item.name,
        reference: item.reference ?? null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_amount: item.discountAmount,
        tax_rate: item.taxRate,
        metadata: item.metadata ?? {},
      })),
      p_payments: payments
        .filter((payment) => payment.amount > 0)
        .map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          reference_code: payment.referenceCode || null,
          pin_code: payment.pinCode || null,
        })),
      p_sale_discount: saleDiscount,
      p_notes: saleNotes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      remaining > 0
        ? `Venda registada com ${money(remaining, defaultCurrency)} pendente.`
        : 'Venda concluída e paga.'
    );
    resetSale();
    await loadFinance();
    setActiveTab('sales');
  }

  async function openCashRegister() {
    if (!accountId || !user?.id || !canOperate) return;
    setSaving(true);
    const { error } = await supabase.rpc('open_finance_cash_session', {
      p_opening_amount: openingAmount,
      p_notes: cashNotes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Caixa aberto.');
    setCashOpen(false);
    setCashNotes('');
    await loadFinance();
  }

  async function closeCashRegister() {
    if (!cashSession || !user?.id || !canOperate) return;
    const expected = Number(cashSnapshot?.expected_amount ?? 0);
    const counted = {
      ...closingBreakdown,
      cash: closingAmount,
    };
    setSaving(true);
    const { error } = await supabase.rpc('close_finance_cash_session_v2', {
      p_cash_session_id: cashSession.id,
      p_counted_breakdown: counted,
      p_notes: cashNotes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      `Caixa fechado. Diferença: ${money(closingAmount - expected, defaultCurrency)}.`
    );
    setCashCloseOpen(false);
    setClosingBreakdown({});
    setCashNotes('');
    await loadFinance();
  }

  async function addCashMovement() {
    if (
      !cashSession ||
      !canOperate ||
      cashMovementAmount <= 0 ||
      !cashMovementDescription.trim()
    )
      return;
    setSaving(true);
    const { error } = await supabase.rpc('add_finance_register_movement', {
      p_cash_session_id: cashSession.id,
      p_movement_type: cashMovementType,
      p_amount: cashMovementAmount,
      p_description: cashMovementDescription.trim(),
      p_reference: cashMovementReference.trim() || null,
      p_payment_method: cashMovementMethod,
      p_category: cashMovementCategory.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Movimento de caixa registado.');
    setCashMovementOpen(false);
    setCashMovementAmount(0);
    setCashMovementDescription('');
    setCashMovementReference('');
    setCashMovementCategory('');
    setCashMovementMethod('cash');
    await loadFinance();
  }

  function clearCashMovementForm() {
    setCashMovementOpen(false);
    setEditingCashMovement(null);
    setCashMovementType('expense');
    setCashMovementMethod('cash');
    setCashMovementCategory('');
    setCashMovementAmount(0);
    setCashMovementDescription('');
    setCashMovementReference('');
  }

  function startEditCashMovement(movement: FinanceCashMovement) {
    setEditingCashMovement(movement);
    setCashMovementType(
      movement.movement_type as
        'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
    );
    setCashMovementMethod(movement.payment_method || 'cash');
    setCashMovementCategory(movement.category || '');
    setCashMovementAmount(Number(movement.amount));
    setCashMovementDescription(movement.description);
    setCashMovementReference(movement.reference || '');
  }

  async function updateCashMovement() {
    if (
      !editingCashMovement ||
      !canOperate ||
      cashMovementAmount <= 0 ||
      !cashMovementDescription.trim()
    )
      return;
    setSaving(true);
    const { error } = await supabase
      .from('finance_cash_movements')
      .update({
        movement_type: cashMovementType,
        payment_method: cashMovementMethod,
        category: cashMovementCategory.trim() || null,
        amount: cashMovementAmount,
        description: cashMovementDescription.trim(),
        reference: cashMovementReference.trim() || null,
      })
      .eq('id', editingCashMovement.id)
      .eq('account_id', accountId);
    setSaving(false);
    if (error) return toast.error(`Não foi possível editar: ${error.message}`);
    toast.success('Lançamento atualizado.');
    clearCashMovementForm();
    await loadFinance();
  }

  async function deleteCashMovement() {
    if (!deletingCashMovement || !canEditSettings) return;
    setSaving(true);
    const { error } = await supabase
      .from('finance_cash_movements')
      .delete()
      .eq('id', deletingCashMovement.id)
      .eq('account_id', accountId);
    setSaving(false);
    if (error) return toast.error(`Não foi possível excluir: ${error.message}`);
    toast.success('Lançamento excluído do caixa.');
    setDeletingCashMovement(null);
    await loadFinance();
  }

  function startReverseSale(sale: FinanceSale) {
    setReverseSale(sale);
    setReverseMode(Number(sale.paid_amount) > 0 ? 'refund' : 'void');
    setReverseReason('');
  }

  async function confirmReverseSale() {
    if (!reverseSale || !reverseReason.trim() || !canOperate) return;
    setSaving(true);
    const { error } = await supabase.rpc('reverse_finance_sale', {
      p_sale_id: reverseSale.id,
      p_mode: reverseMode,
      p_reason: reverseReason.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      reverseMode === 'refund'
        ? 'Venda reembolsada e movimentos revertidos.'
        : 'Venda anulada e stock reposto.'
    );
    setReverseSale(null);
    setReverseReason('');
    await loadFinance();
  }

  function addVoucherToCart() {
    const selectedVoucherService = services.find(
      (service) => service.id === voucherServiceId
    );
    if (
      (voucherType === 'gift_card' && voucherValue <= 0) ||
      (voucherType === 'service' && !selectedVoucherService) ||
      !/^\d{4,8}$/.test(voucherPin)
    ) {
      toast.error('Defina o valor ou serviço e um PIN de 4 a 8 números.');
      return;
    }
    const saleValue =
      voucherType === 'service'
        ? Number(selectedVoucherService?.price ?? 0)
        : voucherValue;
    setCart((current) => [
      ...current,
      {
        key: `voucher-${randomId()}`,
        itemType: 'voucher',
        name:
          voucherType === 'service'
            ? `Voucher · ${selectedVoucherService?.name}`
            : `Cartão-presente ${money(saleValue, defaultCurrency)}`,
        quantity: 1,
        unitPrice: saleValue,
        discountAmount: 0,
        taxRate: 0,
        metadata: {
          face_value: saleValue,
          voucher_type: voucherType,
          service_id: selectedVoucherService?.id ?? null,
          service_name: selectedVoucherService?.name ?? null,
          pin_code: voucherPin,
          recipient_name: voucherRecipient,
          message: voucherMessage,
          validity_days: voucherValidity,
        },
      },
    ]);
    setVoucherOpen(false);
    setVoucherRecipient('');
    setVoucherMessage('');
    setVoucherServiceId('');
    setVoucherPin(randomPin());
  }

  function addCustomToCart() {
    if (!customName.trim() || customPrice < 0) return;
    setCart((current) => [
      ...current,
      {
        key: `custom-${randomId()}`,
        itemType: 'custom',
        name: customName.trim(),
        quantity: 1,
        unitPrice: customPrice,
        discountAmount: 0,
        taxRate: 0,
      },
    ]);
    setCustomOpen(false);
    setCustomName('');
    setCustomPrice(0);
  }

  function startLaterPayment(sale: FinanceSale) {
    setPaymentSale(sale);
    setLaterPaymentAmount(Number(sale.balance_due));
    setLaterPaymentMethod('card');
    setLaterReference('');
    setLaterPin('');
    setPaymentOpen(true);
  }

  async function receiveLaterPayment() {
    if (!paymentSale || laterPaymentAmount <= 0) return;
    if (laterPaymentMethod === 'cash' && !cashSession)
      return toast.error('Abra o caixa para receber dinheiro.');
    if (
      laterPaymentMethod === 'voucher' &&
      (!laterReference.trim() || !laterPin.trim())
    )
      return toast.error('Informe o código e o PIN do voucher.');
    if (laterPaymentMethod === 'client_credit') {
      if (!paymentSale.contact_id)
        return toast.error('Esta venda não possui um cliente associado.');
      const { data: wallet } = await supabase
        .from('finance_client_wallets')
        .select('balance')
        .eq('account_id', accountId)
        .eq('contact_id', paymentSale.contact_id)
        .eq('currency', paymentSale.currency)
        .maybeSingle();
      if (Number(wallet?.balance ?? 0) < laterPaymentAmount)
        return toast.error('O cartão-saldo do cliente é insuficiente.');
    }
    setSaving(true);
    const { error } = await supabase.rpc('add_finance_payment_secure', {
      p_sale_id: paymentSale.id,
      p_method: laterPaymentMethod,
      p_amount: laterPaymentAmount,
      p_cash_session_id: cashSession?.id ?? null,
      p_reference_code: laterReference || null,
      p_pin_code: laterPin || null,
      p_notes: null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Pagamento registado.');
    setPaymentOpen(false);
    await loadFinance();
  }

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );

  if (schemaMissing) {
    return (
      <div className="space-y-5">
        <PageHeader cashSession={cashSession} onRefresh={loadFinance} />
        <div className="border-border bg-card rounded-lg border p-8 text-center">
          <CircleDollarSign className="text-muted-foreground mx-auto size-8" />
          <h2 className="mt-3 text-lg font-semibold">
            Módulo financeiro pronto para ativação
          </h2>
          <p className="text-muted-foreground mx-auto mt-1 max-w-xl text-sm">
            Aplique a migração <code>051_finance_pos.sql</code> no Supabase para
            criar POS, pagamentos, caixa, packs, vouchers e stock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader cashSession={cashSession} onRefresh={loadFinance} />
      {activeTab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FinanceMetric
            label="Faturado"
            value={money(financeMetrics.billed, defaultCurrency)}
            detail={`${sales.length} vendas recentes`}
            icon={ReceiptText}
          />
          <FinanceMetric
            label="Recebido"
            value={money(financeMetrics.received, defaultCurrency)}
            detail="pagamentos confirmados"
            icon={CircleDollarSign}
          />
          <FinanceMetric
            label="A receber"
            value={money(financeMetrics.due, defaultCurrency)}
            detail={`${financeMetrics.openSales} contas pendentes`}
            icon={History}
          />
          <FinanceMetric
            label="Caixa esperado"
            value={money(
              Number(cashSnapshot?.expected_amount ?? 0),
              defaultCurrency
            )}
            detail={cashSession ? 'sessão atual' : 'caixa fechado'}
            icon={Banknote}
          />
          <FinanceMetric
            label="Benefícios ativos"
            value={String(
              vouchers.filter((item) => item.status === 'active').length +
                clientPacks.filter((item) => item.status === 'active').length
            )}
            detail="vouchers e packs"
            icon={WalletCards}
          />
        </div>
      )}
      {initialAppointmentId ? (
        <div className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Pagamento de marcação</p>
            <p className="text-muted-foreground text-xs">
              {checkoutAppointmentLabel || 'A preparar serviço e cliente...'}
            </p>
          </div>
          <span className="text-primary text-xs font-medium">
            O pagamento integral atualizará a agenda
          </span>
        </div>
      ) : null}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <div className="border-border bg-background/95 sticky top-0 z-20 -mx-1 overflow-x-auto border-b px-1 py-2 backdrop-blur">
          <TabsList className="bg-muted/60 flex h-10 w-full min-w-max justify-start gap-1 p-1 [&_button]:!h-8 [&_button]:!min-h-0 [&_button]:!rounded-md [&_button]:!border-0 [&_button]:!px-3 [&_button]:!py-1 [&_button]:!shadow-none [&_button>span>span:last-child]:hidden">
            <TabsTrigger
              value="overview"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <LayoutDashboard />
              <span className="text-left">
                <span className="block font-semibold">Visão geral</span>
                <span className="text-muted-foreground block text-[10px]">
                  Indicadores e ações
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="pos"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <ShoppingCart />
              <span className="text-left">
                <span className="block font-semibold">Ponto de venda</span>
                <span className="text-muted-foreground block text-[10px]">
                  Cobrar e faturar
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <ReceiptText />
              <span className="text-left">
                <span className="block font-semibold">Vendas</span>
                <span className="text-muted-foreground block text-[10px]">
                  Histórico e saldos
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="invoices"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <FileClock />
              <span className="text-left">
                <span className="block font-semibold">Faturas</span>
                <span className="text-muted-foreground block text-[10px]">
                  Pedidos e documentos
                </span>
              </span>
              {invoiceRequests.filter((item) => item.status === 'pending')
                .length > 0 && (
                <Badge variant="destructive">
                  {
                    invoiceRequests.filter((item) => item.status === 'pending')
                      .length
                  }
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cash"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <Banknote />
              <span className="text-left">
                <span className="block font-semibold">Caixa</span>
                <span className="text-muted-foreground block text-[10px]">
                  Sessões e movimentos
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="vouchers"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <Gift />
              <span className="text-left">
                <span className="block font-semibold">Vouchers</span>
                <span className="text-muted-foreground block text-[10px]">
                  Saldos e utilização
                </span>
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="packs"
              className="border-border data-active:border-primary data-active:bg-primary/5 bg-card min-h-16 justify-start rounded-xl border px-3 py-2 shadow-sm"
            >
              <PackageCheck />
              <span className="text-left">
                <span className="block font-semibold">Packs</span>
                <span className="text-muted-foreground block text-[10px]">
                  Planos e sessões
                </span>
              </span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger
                value="treasury"
                className="bg-card min-h-16 justify-start rounded-xl border border-amber-500/30 px-3 py-2 shadow-sm data-active:border-amber-500 data-active:bg-amber-500/10"
              >
                <Landmark />
                <span className="text-left">
                  <span className="block font-semibold">Gestão privada</span>
                  <span className="text-muted-foreground block text-[10px]">
                    Só proprietários
                  </span>
                </span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <FinanceOverview
            sales={sales}
            cashSession={cashSession}
            vouchers={vouchers}
            clientPacks={clientPacks}
            invoiceRequests={invoiceRequests}
            currency={defaultCurrency}
            isOwner={isOwner}
            onNavigate={setActiveTab}
          />
        </TabsContent>

        <TabsContent value="pos">
          <PosView
            {...{
              catalogMode,
              setCatalogMode,
              search,
              setSearch,
              catalog,
              addCatalogItem,
              cart,
              updateCart,
              removeCart,
              contacts,
              contactId,
              setContactId,
              clientWalletBalance,
              subtotal,
              itemDiscount,
              tax,
              saleDiscount,
              setSaleDiscount,
              total,
              payments,
              setPayments,
              addPayment,
              paidNow,
              remaining,
              saleNotes,
              setSaleNotes,
              defaultCurrency,
              canOperate,
              saving,
              finishSale,
              resetSale,
              setCustomOpen,
              setVoucherOpen,
              cashSession,
            }}
          />
        </TabsContent>
        <TabsContent value="sales">
          <SalesView
            sales={sales}
            currency={defaultCurrency}
            onPayment={startLaterPayment}
            onReverse={startReverseSale}
            canOperate={canOperate}
            canRefund={canEditSettings}
            brand={{
              name: account?.name || 'CRM',
              logoUrl: account?.logo_url,
              publicUrl: account?.public_url,
            }}
          />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoiceRequestsView
            requests={invoiceRequests}
            canManage={canEditSettings}
            onRefresh={loadFinance}
          />
        </TabsContent>
        <TabsContent value="cash">
          <CashView
            cashSession={cashSession}
            sales={sales}
            snapshot={cashSnapshot}
            movements={cashMovements}
            sessions={cashSessions}
            currency={defaultCurrency}
            canOperate={canOperate}
            canDelete={canEditSettings}
            onOpen={() => setCashOpen(true)}
            onMovement={() => setCashMovementOpen(true)}
            onEditMovement={startEditCashMovement}
            onDeleteMovement={setDeletingCashMovement}
            onClose={() => {
              setClosingAmount(Number(cashSnapshot?.expected_amount ?? 0));
              const totals = Object.fromEntries(
                PAYMENT_METHODS.map(({ value }) => [
                  value,
                  Number(cashSnapshot?.payments_by_method?.[value] ?? 0) +
                    Number(cashSnapshot?.tips_by_method?.[value] ?? 0),
                ])
              ) as Record<FinancePaymentMethod, number>;
              totals.cash = Number(cashSnapshot?.expected_amount ?? 0);
              setClosingBreakdown(totals);
              setCashCloseOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="vouchers">
          <VouchersView
            vouchers={vouchers}
            logs={benefitLogs}
            currency={defaultCurrency}
            brand={{
              name: account?.name || 'CRM',
              logoUrl: account?.logo_url,
              publicUrl: account?.public_url,
            }}
            onSell={() => {
              setActiveTab('pos');
              setVoucherOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="packs">
          <PacksView
            packs={packs}
            clientPacks={clientPacks}
            logs={benefitLogs}
            currency={defaultCurrency}
            canConfigure={canEditSettings}
            onCreate={() => window.location.assign('/settings?tab=clinic')}
          />
        </TabsContent>
        {isOwner && (
          <TabsContent value="treasury">
            <OwnerTreasury />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
            <DialogDescription>
              Informe o fundo inicial disponível em dinheiro.
            </DialogDescription>
          </DialogHeader>
          <Field label="Valor inicial">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={openingAmount}
              onChange={(event) => setOpeningAmount(Number(event.target.value))}
            />
          </Field>
          <Field label="Observação">
            <Textarea
              value={cashNotes}
              onChange={(event) => setCashNotes(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={openCashRegister} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Abrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cashCloseOpen} onOpenChange={setCashCloseOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>
              Conte todo o dinheiro físico antes de fechar.
            </DialogDescription>
          </DialogHeader>
          <Field label="Valor contado">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={closingAmount}
              onChange={(event) => setClosingAmount(Number(event.target.value))}
            />
          </Field>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Conferência por canal</p>
              <p className="text-muted-foreground text-xs">
                Confirme os totais dos terminais e extratos do turno.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {REGISTER_METHODS.filter(({ value }) => value !== 'cash').map(
                (method) => {
                  const expected =
                    Number(
                      cashSnapshot?.payments_by_method?.[method.value] ?? 0
                    ) +
                    Number(cashSnapshot?.tips_by_method?.[method.value] ?? 0);
                  const counted = Number(
                    closingBreakdown[method.value] ?? expected
                  );
                  return (
                    <Field key={method.value} label={method.label}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={counted}
                        onChange={(event) =>
                          setClosingBreakdown((current) => ({
                            ...current,
                            [method.value]: Number(event.target.value),
                          }))
                        }
                      />
                      <p
                        className={cn(
                          'mt-1 text-[11px]',
                          Math.abs(counted - expected) > 0.009
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        Sistema: {money(expected, defaultCurrency)}
                        {Math.abs(counted - expected) > 0.009
                          ? ` · diferença ${money(counted - expected, defaultCurrency)}`
                          : ' · conferido'}
                      </p>
                    </Field>
                  );
                }
              )}
            </div>
          </div>
          <div className="bg-muted grid grid-cols-2 gap-3 rounded-md p-3 text-sm">
            <span className="text-muted-foreground">Esperado</span>
            <strong className="text-right">
              {money(
                Number(cashSnapshot?.expected_amount ?? 0),
                defaultCurrency
              )}
            </strong>
            <span className="text-muted-foreground">Diferença</span>
            <strong
              className={cn(
                'text-right',
                Math.abs(
                  closingAmount - Number(cashSnapshot?.expected_amount ?? 0)
                ) > 0.009 && 'text-destructive'
              )}
            >
              {money(
                closingAmount - Number(cashSnapshot?.expected_amount ?? 0),
                defaultCurrency
              )}
            </strong>
          </div>
          <Field label="Observação do fecho">
            <Textarea
              value={cashNotes}
              onChange={(event) => setCashNotes(event.target.value)}
              placeholder="Justifique diferenças ou ocorrências do turno"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashCloseOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={closeCashRegister} disabled={saving}>
              Fechar caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item livre</DialogTitle>
            <DialogDescription>
              Venda um item ou serviço que ainda não existe no catálogo.
            </DialogDescription>
          </DialogHeader>
          <Field label="Descrição">
            <Input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
            />
          </Field>
          <Field label="Preço">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={customPrice}
              onChange={(event) => setCustomPrice(Number(event.target.value))}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addCustomToCart}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo presente</DialogTitle>
            <DialogDescription>
              Venda saldo livre ou uma modalidade específica com código e PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted grid grid-cols-2 gap-1 rounded-md p-1">
            <button
              type="button"
              onClick={() => setVoucherType('gift_card')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${voucherType === 'gift_card' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Cartão-presente
            </button>
            <button
              type="button"
              onClick={() => setVoucherType('service')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${voucherType === 'service' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              Voucher de serviço
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {voucherType === 'gift_card' ? (
              <Field label="Valor do cartão">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={voucherValue}
                  onChange={(event) =>
                    setVoucherValue(Number(event.target.value))
                  }
                />
              </Field>
            ) : (
              <Field label="Modalidade oferecida">
                <NativeSelect
                  value={voucherServiceId}
                  onChange={setVoucherServiceId}
                >
                  <option value="">Selecione um serviço</option>
                  {services
                    .filter((service) => service.is_active)
                    .map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ·{' '}
                        {money(Number(service.price), service.currency)}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Validade (dias)">
              <Input
                type="number"
                min="1"
                value={voucherValidity}
                onChange={(event) =>
                  setVoucherValidity(Number(event.target.value))
                }
              />
            </Field>
          </div>
          <Field label="PIN de utilização">
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={voucherPin}
                onChange={(event) =>
                  setVoucherPin(
                    event.target.value.replace(/\D/g, '').slice(0, 8)
                  )
                }
                placeholder="4 a 8 números"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setVoucherPin(randomPin())}
              >
                Gerar PIN
              </Button>
            </div>
          </Field>
          <Field label="Destinatário">
            <Input
              value={voucherRecipient}
              onChange={(event) => setVoucherRecipient(event.target.value)}
            />
          </Field>
          <Field label="Mensagem para quem vai receber">
            <Textarea
              value={voucherMessage}
              onChange={(event) => setVoucherMessage(event.target.value)}
              placeholder="Ex.: Este presente foi escolhido especialmente para você. Aproveite!"
              maxLength={180}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoucherOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addVoucherToCart}>Adicionar ao carrinho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receber pagamento</DialogTitle>
            <DialogDescription>
              Venda #{paymentSale?.sale_number} · saldo{' '}
              {money(Number(paymentSale?.balance_due ?? 0), defaultCurrency)}
            </DialogDescription>
          </DialogHeader>
          <Field label="Meio de pagamento">
            <NativeSelect
              value={laterPaymentMethod}
              onChange={(value) =>
                setLaterPaymentMethod(value as FinancePaymentMethod)
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Valor">
            <Input
              type="number"
              min="0.01"
              max={Number(paymentSale?.balance_due ?? 0)}
              step="0.01"
              value={laterPaymentAmount}
              onChange={(event) =>
                setLaterPaymentAmount(Number(event.target.value))
              }
            />
          </Field>
          {laterPaymentMethod === 'voucher' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Código do voucher">
                <Input
                  value={laterReference}
                  onChange={(event) => setLaterReference(event.target.value)}
                />
              </Field>
              <Field label="PIN">
                <Input
                  value={laterPin}
                  inputMode="numeric"
                  type="password"
                  onChange={(event) => setLaterPin(event.target.value)}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={receiveLaterPayment} disabled={saving}>
              Registar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cashMovementOpen || Boolean(editingCashMovement)}
        onOpenChange={(open) => {
          if (!open) clearCashMovementForm();
          else setCashMovementOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCashMovement
                ? 'Editar lançamento do caixa'
                : 'Novo movimento de caixa'}
            </DialogTitle>
            <DialogDescription>
              {editingCashMovement
                ? 'A alteração recalcula imediatamente os totais e a conferência do turno.'
                : 'Registe gorjetas, entradas, retiradas, despesas ou acertos em qualquer forma de pagamento.'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Tipo de movimento">
            <NativeSelect
              value={cashMovementType}
              onChange={(value) =>
                setCashMovementType(
                  value as
                    'deposit' | 'withdrawal' | 'expense' | 'adjustment' | 'tip'
                )
              }
            >
              <option value="tip">Gorjeta</option>
              <option value="deposit">Entrada / reforço</option>
              <option value="withdrawal">Retirada / sangria</option>
              <option value="expense">Despesa</option>
              <option value="adjustment">Ajuste</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento">
              <NativeSelect
                value={cashMovementMethod}
                onChange={(value) =>
                  setCashMovementMethod(value as FinancePaymentMethod)
                }
              >
                {REGISTER_METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Categoria (opcional)">
              <Input
                value={cashMovementCategory}
                onChange={(event) =>
                  setCashMovementCategory(event.target.value)
                }
                placeholder={
                  cashMovementType === 'tip'
                    ? 'Equipa, profissional...'
                    : 'Operação, despesas...'
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={cashMovementAmount}
                onChange={(event) =>
                  setCashMovementAmount(Number(event.target.value))
                }
              />
            </Field>
            <Field label="Referência (opcional)">
              <Input
                value={cashMovementReference}
                onChange={(event) =>
                  setCashMovementReference(event.target.value)
                }
                placeholder="Fatura, recibo ou documento"
              />
            </Field>
          </div>
          <Field label="Motivo">
            <Textarea
              value={cashMovementDescription}
              onChange={(event) =>
                setCashMovementDescription(event.target.value)
              }
              placeholder="Descreva por que este movimento foi realizado"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={clearCashMovementForm}>
              Cancelar
            </Button>
            <Button
              onClick={
                editingCashMovement ? updateCashMovement : addCashMovement
              }
              disabled={
                saving ||
                cashMovementAmount <= 0 ||
                !cashMovementDescription.trim()
              }
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : editingCashMovement ? (
                <Pencil />
              ) : (
                <Plus />
              )}
              {editingCashMovement
                ? 'Guardar alterações'
                : 'Registar movimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deletingCashMovement)}
        onOpenChange={(open) => !open && setDeletingCashMovement(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento do caixa?</DialogTitle>
            <DialogDescription>
              O lançamento “{deletingCashMovement?.description}” será removido e
              os totais do turno serão recalculados. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingCashMovement(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={deleteCashMovement}
              disabled={saving || !canEditSettings}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(reverseSale)}
        onOpenChange={(open) => !open && setReverseSale(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reverseMode === 'refund' ? 'Reembolsar venda' : 'Anular venda'}
            </DialogTitle>
            <DialogDescription>
              Venda #{reverseSale?.sale_number}. O sistema reverte pagamentos,
              stock e benefícios ainda não utilizados, mantendo o histórico de
              auditoria.
            </DialogDescription>
          </DialogHeader>
          {reverseMode === 'refund' && !canEditSettings ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              Apenas proprietários e administradores podem reembolsar valores
              recebidos.
            </div>
          ) : null}
          <Field label="Motivo obrigatório">
            <Textarea
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="Informe o motivo para constar na auditoria"
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseSale(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReverseSale}
              disabled={
                saving ||
                !reverseReason.trim() ||
                (reverseMode === 'refund' && !canEditSettings)
              }
            >
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Confirmar {reverseMode === 'refund' ? 'reembolso' : 'anulação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FinanceOverview({
  sales,
  cashSession,
  vouchers,
  clientPacks,
  invoiceRequests,
  currency,
  isOwner,
  onNavigate,
}: {
  sales: FinanceSale[];
  cashSession: FinanceCashSession | null;
  vouchers: FinanceVoucher[];
  clientPacks: FinanceClientPack[];
  invoiceRequests: FinanceInvoiceRequest[];
  currency: string;
  isOwner: boolean;
  onNavigate: (value: string) => void;
}) {
  const openSales = sales.filter(
    (sale) => sale.status === 'open' || sale.status === 'partially_paid'
  );
  const due = openSales.reduce(
    (sum, sale) => sum + Number(sale.balance_due),
    0
  );
  const recent = sales.slice(0, 6);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Operação financeira</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewAction
            icon={ShoppingCart}
            title="Nova venda"
            detail="Registar serviços, produtos e pagamentos"
            onClick={() => onNavigate('pos')}
          />
          <OverviewAction
            icon={History}
            title="Valores a receber"
            detail={`${openSales.length} vendas · ${money(due, currency)}`}
            onClick={() => onNavigate('sales')}
          />
          <OverviewAction
            icon={Banknote}
            title={cashSession ? 'Caixa aberto' : 'Abrir caixa'}
            detail={
              cashSession
                ? 'Consultar movimentos da sessão'
                : 'Iniciar operação em dinheiro'
            }
            onClick={() => onNavigate('cash')}
          />
          <OverviewAction
            icon={FileClock}
            title="Pedidos de fatura"
            detail={`${invoiceRequests.filter((item) => item.status === 'pending').length} aguardam tratamento`}
            onClick={() => onNavigate('invoices')}
          />
          <OverviewAction
            icon={Gift}
            title="Benefícios"
            detail={`${vouchers.filter((item) => item.status === 'active').length} vouchers ativos`}
            onClick={() => onNavigate('vouchers')}
          />
          {isOwner && (
            <OverviewAction
              icon={Landmark}
              title="Gestão e tesouraria"
              detail="Contas, prestações e fluxo de caixa"
              onClick={() => onNavigate('treasury')}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Estado atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <OverviewLine
            label="Caixa"
            value={cashSession ? 'Aberto' : 'Fechado'}
            positive={Boolean(cashSession)}
          />
          <OverviewLine
            label="Vendas pendentes"
            value={String(openSales.length)}
          />
          <OverviewLine
            label="Faturas pendentes"
            value={String(
              invoiceRequests.filter((item) => item.status === 'pending').length
            )}
          />
          <OverviewLine
            label="Vouchers ativos"
            value={String(
              vouchers.filter((item) => item.status === 'active').length
            )}
          />
          <OverviewLine
            label="Packs ativos"
            value={String(
              clientPacks.filter((item) => item.status === 'active').length
            )}
          />
        </CardContent>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Últimas vendas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length ? (
            recent.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => onNavigate('sales')}
                className="hover:bg-muted flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">
                    Venda #{sale.sale_number} ·{' '}
                    {sale.contact?.name || 'Cliente não identificado'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {SALE_STATUS[sale.status] || sale.status} ·{' '}
                    {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <strong>
                  {money(sale.total_amount, sale.currency || currency)}
                </strong>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Ainda não existem vendas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewAction({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:border-primary/50 hover:bg-primary/5 flex gap-3 rounded-xl border p-4 text-left transition-colors"
    >
      <span className="bg-primary/10 text-primary rounded-lg p-2">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
          {detail}
        </span>
      </span>
    </button>
  );
}

function OverviewLine({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={positive ? 'default' : 'secondary'}>{value}</Badge>
    </div>
  );
}

function PageHeader({
  cashSession,
  onRefresh,
}: {
  cashSession: FinanceCashSession | null;
  onRefresh: () => void;
}) {
  return (
    <div className="border-border flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">Centro Financeiro</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Operação, recebimentos, caixa, benefícios e gestão financeira num só
          lugar.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={cashSession ? 'default' : 'secondary'}>
          {cashSession ? 'Caixa aberto' : 'Caixa fechado'}
        </Badge>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw /> Atualizar
        </Button>
      </div>
    </div>
  );
}

function PosView(props: {
  catalogMode: 'services' | 'products' | 'packs';
  setCatalogMode: (value: 'services' | 'products' | 'packs') => void;
  search: string;
  setSearch: (value: string) => void;
  catalog: CatalogItem[];
  addCatalogItem: (item: CatalogItem) => void;
  cart: CartItem[];
  updateCart: (key: string, patch: Partial<CartItem>) => void;
  removeCart: (key: string) => void;
  contacts: Contact[];
  contactId: string;
  setContactId: (value: string) => void;
  clientWalletBalance: number;
  subtotal: number;
  itemDiscount: number;
  tax: number;
  saleDiscount: number;
  setSaleDiscount: (value: number) => void;
  total: number;
  payments: PaymentDraft[];
  setPayments: React.Dispatch<React.SetStateAction<PaymentDraft[]>>;
  addPayment: () => void;
  paidNow: number;
  remaining: number;
  saleNotes: string;
  setSaleNotes: (value: string) => void;
  defaultCurrency: string;
  canOperate: boolean;
  saving: boolean;
  finishSale: () => void;
  resetSale: () => void;
  setCustomOpen: (value: boolean) => void;
  setVoucherOpen: (value: boolean) => void;
  cashSession: FinanceCashSession | null;
}) {
  const {
    catalogMode,
    setCatalogMode,
    search,
    setSearch,
    catalog,
    cart,
    updateCart,
    removeCart,
    contacts,
    contactId,
    setContactId,
    clientWalletBalance,
    subtotal,
    itemDiscount,
    tax,
    saleDiscount,
    setSaleDiscount,
    total,
    payments,
    setPayments,
    addPayment,
    paidNow,
    remaining,
    saleNotes,
    setSaleNotes,
    defaultCurrency,
    canOperate,
    saving,
    finishSale,
    resetSale,
    setCustomOpen,
    setVoucherOpen,
    cashSession,
  } = props;
  const [clientSearch, setClientSearch] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const selectedContact = contacts.find((contact) => contact.id === contactId);
  const filteredContacts = useMemo(() => {
    const term = clientSearch.trim().toLocaleLowerCase('pt');
    const matches = term
      ? contacts.filter((contact) =>
          [
            contact.name,
            contact.phone,
            contact.client_reference,
            contact.email,
            contact.tax_id,
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('pt')
            .includes(term)
        )
      : contacts;

    return matches.slice(0, 12);
  }, [clientSearch, contacts]);

  return (
    <div className="grid min-h-[680px] min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="border-border bg-card min-w-0 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-border bg-card/95 sticky top-0 z-10 space-y-3 border-b p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="bg-muted flex rounded-md p-1">
              {(['services', 'products', 'packs'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCatalogMode(mode)}
                  aria-pressed={catalogMode === mode}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${catalogMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mode === 'services'
                    ? 'Serviços'
                    : mode === 'products'
                      ? 'Produtos'
                      : 'Packs'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVoucherOpen(true)}
              >
                <Gift /> Voucher
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomOpen(true)}
              >
                <Plus /> Item livre
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar catálogo..."
              aria-label="Pesquisar no catálogo"
              className="h-10 pl-9"
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSearch('')}
                aria-label="Limpar pesquisa"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
              >
                <X />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
          {catalog.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => props.addCatalogItem(item)}
              disabled={item.available === false}
              className="border-border bg-background hover:border-primary/35 hover:bg-primary/[0.03] disabled:bg-muted/40 group min-h-32 rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="bg-primary-soft text-primary flex size-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105">
                  {item.type === 'service' ? (
                    <BadgeEuro />
                  ) : item.type === 'product' ? (
                    <Box />
                  ) : (
                    <PackageCheck />
                  )}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {money(item.price, defaultCurrency)}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-snug font-medium">
                {item.name}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.detail}
              </p>
            </button>
          ))}
          {catalog.length === 0 ? (
            <div className="text-muted-foreground col-span-full flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <Search className="mb-3 size-8 opacity-40" />
              <p className="text-foreground text-sm font-medium">
                Nenhum item encontrado
              </p>
              <p className="mt-1 max-w-xs text-xs">
                Experimente outro termo ou selecione uma categoria diferente.
              </p>
              {search ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setSearch('')}
                  className="mt-2"
                >
                  Limpar pesquisa
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className="border-border bg-card flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-xl border shadow-sm xl:sticky xl:top-16 xl:max-h-[calc(100vh-5rem)]">
        <div className="border-border flex items-center justify-between border-b p-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <span className="bg-primary-soft text-primary flex size-8 items-center justify-center rounded-lg">
                <ShoppingCart className="size-4" />
              </span>
              Venda atual
            </h2>
            <p className="text-muted-foreground text-xs">
              {cart.length} {cart.length === 1 ? 'item' : 'itens'} ·{' '}
              <span className={cashSession ? 'text-emerald-600' : undefined}>
                {cashSession ? 'caixa aberto' : 'sem caixa'}
              </span>
            </p>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={resetSale}>
              <Trash2 /> Limpar
            </Button>
          )}
        </div>
        <div className="space-y-3 p-4">
          <Field label="Cliente">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
              <Input
                value={clientSearch}
                onChange={(event) => {
                  setClientSearch(event.target.value);
                  setClientSearchOpen(true);
                }}
                onFocus={() => setClientSearchOpen(true)}
                onBlur={() => setClientSearchOpen(false)}
                placeholder={
                  selectedContact
                    ? 'Pesquisar outro cliente...'
                    : 'Nome, telefone, email ou NIF...'
                }
                aria-label="Pesquisar cliente"
                aria-expanded={clientSearchOpen}
                aria-controls="pos-client-results"
                autoComplete="off"
                className="h-10 pr-9 pl-9"
              />
              {clientSearch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setClientSearch('')}
                  aria-label="Limpar pesquisa de cliente"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2"
                >
                  <X />
                </Button>
              ) : null}
              {clientSearchOpen ? (
                <div
                  id="pos-client-results"
                  className="border-border bg-popover absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border p-1 shadow-lg"
                >
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setContactId('');
                      setClientSearch('');
                      setClientSearchOpen(false);
                    }}
                    className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm"
                  >
                    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                      <UserRound className="size-4" />
                    </span>
                    <span>
                      <span className="block font-medium">
                        Consumidor final
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Venda sem cliente associado
                      </span>
                    </span>
                  </button>
                  <div className="bg-border mx-2 my-1 h-px" />
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setContactId(contact.id);
                        setClientSearch('');
                        setClientSearchOpen(false);
                      }}
                      className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
                    >
                      <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                        {(contact.name || contact.phone)
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {contact.name || 'Cliente sem nome'}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[contact.phone, contact.client_reference]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {contact.id === contactId ? (
                        <Check className="text-primary size-4 shrink-0" />
                      ) : null}
                    </button>
                  ))}
                  {filteredContacts.length === 0 ? (
                    <div className="text-muted-foreground px-3 py-6 text-center text-sm">
                      Nenhum cliente encontrado para “{clientSearch}”.
                    </div>
                  ) : null}
                  {contacts.length > filteredContacts.length ? (
                    <p className="text-muted-foreground border-border border-t px-3 py-2 text-center text-[11px]">
                      Escreva mais para refinar os resultados
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Field>
          {selectedContact ? (
            <div className="border-primary/20 bg-primary/[0.04] flex items-center gap-3 rounded-lg border p-3">
              <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {(selectedContact.name || selectedContact.phone)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {selectedContact.name || 'Cliente sem nome'}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {selectedContact.phone}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setContactId('')}
                aria-label="Remover cliente da venda"
              >
                <X />
              </Button>
            </div>
          ) : null}
          {contactId ? (
            <div className="border-border bg-muted/40 flex items-center justify-between rounded-md border px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Cartão-saldo disponível
              </span>
              <span className="font-semibold">
                {money(clientWalletBalance, defaultCurrency)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="min-h-40 flex-1 space-y-2 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <div className="text-muted-foreground flex h-44 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm">
              <span className="bg-muted mb-3 flex size-10 items-center justify-center rounded-full">
                <ShoppingCart className="size-5" />
              </span>
              <span className="text-foreground font-medium">
                A venda está vazia
              </span>
              <span className="mt-1 text-xs">Selecione itens no catálogo</span>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.key}
                className="border-border bg-background rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {money(item.unitPrice, defaultCurrency)} cada
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeCart(item.key)}
                  >
                    <X />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[94px_1fr_1fr] gap-2">
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        updateCart(item.key, {
                          quantity: Math.max(1, item.quantity - 1),
                        })
                      }
                    >
                      <Minus />
                    </Button>
                    <span className="w-8 text-center text-xs">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        updateCart(item.key, { quantity: item.quantity + 1 })
                      }
                    >
                      <Plus />
                    </Button>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.discountAmount}
                    onChange={(event) =>
                      updateCart(item.key, {
                        discountAmount: Number(event.target.value),
                      })
                    }
                    title="Desconto"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.taxRate}
                    onChange={(event) =>
                      updateCart(item.key, {
                        taxRate: Number(event.target.value),
                      })
                    }
                    title="IVA %"
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-border bg-card mt-3 space-y-3 border-t p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right">
              {money(subtotal, defaultCurrency)}
            </span>
            <span className="text-muted-foreground">Descontos dos itens</span>
            <span className="text-right">
              -{money(itemDiscount, defaultCurrency)}
            </span>
            <span className="text-muted-foreground">Desconto da venda</span>
            <Input
              type="number"
              min="0"
              max={subtotal - itemDiscount}
              step="0.01"
              value={saleDiscount}
              onChange={(event) => setSaleDiscount(Number(event.target.value))}
              className="h-7 text-right"
            />
            <span className="text-muted-foreground">IVA</span>
            <span className="text-right">{money(tax, defaultCurrency)}</span>
            <span className="border-border mt-1 border-t pt-2 font-semibold">
              Total
            </span>
            <span className="border-border mt-1 border-t pt-2 text-right text-lg font-semibold">
              {money(total, defaultCurrency)}
            </span>
          </div>
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="grid grid-cols-[1fr_110px_32px] gap-2"
              >
                <NativeSelect
                  value={payment.method}
                  onChange={(value) =>
                    setPayments((current) =>
                      current.map((row) =>
                        row.id === payment.id
                          ? { ...row, method: value as FinancePaymentMethod }
                          : row
                      )
                    )
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option
                      key={method.value}
                      value={method.value}
                      disabled={
                        method.value === 'client_credit' &&
                        (!contactId || clientWalletBalance <= 0)
                      }
                    >
                      {method.label}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) =>
                    setPayments((current) =>
                      current.map((row) =>
                        row.id === payment.id
                          ? { ...row, amount: Number(event.target.value) }
                          : row
                      )
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setPayments((current) =>
                      current.filter((row) => row.id !== payment.id)
                    )
                  }
                >
                  <X />
                </Button>
                {payment.method === 'voucher' && (
                  <div className="col-span-3 grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input
                      placeholder="Código do voucher"
                      value={payment.referenceCode}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row) =>
                            row.id === payment.id
                              ? { ...row, referenceCode: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                    <Input
                      placeholder="PIN"
                      inputMode="numeric"
                      type="password"
                      value={payment.pinCode}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((row) =>
                            row.id === payment.id
                              ? { ...row, pinCode: event.target.value }
                              : row
                          )
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addPayment}
              disabled={remaining <= 0}
            >
              <Plus /> Adicionar pagamento
            </Button>
          </div>
          <div className="bg-muted/70 grid grid-cols-2 rounded-lg p-3 text-xs">
            <span>
              Pago agora: <strong>{money(paidNow, defaultCurrency)}</strong>
            </span>
            <span className="text-right">
              Fica pendente:{' '}
              <strong>{money(remaining, defaultCurrency)}</strong>
            </span>
          </div>
          <Textarea
            value={saleNotes}
            onChange={(event) => setSaleNotes(event.target.value)}
            placeholder="Observações da venda"
            className="min-h-16"
          />
          <Button
            className="w-full shadow-sm"
            size="lg"
            onClick={finishSale}
            disabled={!canOperate || saving || cart.length === 0}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />}{' '}
            {remaining > 0 ? 'Registar venda parcial' : 'Concluir venda'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function InvoiceRequestsView({
  requests,
  canManage,
  onRefresh,
}: {
  requests: FinanceInvoiceRequest[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const db = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [selected, setSelected] = useState<FinanceInvoiceRequest | null>(null);
  const [mode, setMode] = useState<'issue' | 'reject'>('issue');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = requests.filter((item) => {
    const term = query.trim().toLowerCase();
    const matchesStatus =
      status === 'all' ||
      (status === 'active'
        ? ['pending', 'processing'].includes(item.status)
        : item.status === status);
    const sale = item.sale;
    const haystack =
      `${item.fiscal_name} ${item.tax_id} ${item.email} ${sale?.sale_number ?? ''}`.toLowerCase();
    return matchesStatus && (!term || haystack.includes(term));
  });

  async function updateStatus(
    item: FinanceInvoiceRequest,
    next: 'processing' | 'cancelled'
  ) {
    if (!canManage) return;
    const now = new Date().toISOString();
    const { error } = await db
      .from('finance_invoice_requests')
      .update({
        status: next,
        handled_by_user_id: user?.id || null,
        processing_at: next === 'processing' ? now : item.processing_at,
        completed_at: next === 'cancelled' ? now : null,
      })
      .eq('id', item.id);
    if (error)
      return toast.error(`Não foi possível atualizar: ${error.message}`);
    toast.success(
      next === 'processing'
        ? 'Pedido assumido para tratamento.'
        : 'Pedido cancelado.'
    );
    await onRefresh();
  }
  function openDecision(
    item: FinanceInvoiceRequest,
    nextMode: 'issue' | 'reject'
  ) {
    setSelected(item);
    setMode(nextMode);
    setInvoiceNumber(item.invoice_number || '');
    setInvoiceFile(null);
    setNotes(item.admin_notes || '');
  }
  async function finish() {
    if (!selected || !canManage) return;
    if (mode === 'issue' && !invoiceNumber.trim())
      return toast.error('Informe o número da fatura emitida.');
    if (mode === 'issue' && !invoiceFile)
      return toast.error('Anexe a fatura em PDF antes de concluir.');
    if (mode === 'reject' && !notes.trim())
      return toast.error('Informe o motivo da rejeição.');
    setSaving(true);
    if (mode === 'issue') {
      const form = new FormData();
      if (invoiceFile) form.append('file', invoiceFile);
      form.append('invoiceNumber', invoiceNumber.trim());
      form.append('notes', notes.trim());
      const response = await fetch(
        `/api/finance/invoice-requests/${selected.id}/document`,
        { method: 'POST', body: form }
      );
      const payload = await response.json().catch(() => ({}));
      setSaving(false);
      if (!response.ok)
        return toast.error(
          payload.error || 'Não foi possível guardar a fatura.'
        );
      toast.success('Fatura emitida e disponibilizada no Portal 360.');
      setSelected(null);
      await onRefresh();
      return;
    }
    const now = new Date().toISOString();
    const { error } = await db
      .from('finance_invoice_requests')
      .update({
        status: 'rejected',
        invoice_number: null,
        admin_notes: notes.trim() || null,
        handled_by_user_id: user?.id || null,
        processing_at: selected.processing_at || now,
        completed_at: now,
      })
      .eq('id', selected.id);
    setSaving(false);
    if (error)
      return toast.error(`Não foi possível concluir: ${error.message}`);
    toast.success('Pedido rejeitado com motivo registado.');
    setSelected(null);
    await onRefresh();
  }
  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold">Pedidos de fatura</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Fila fiscal solicitada pelos clientes através do Portal 360.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="destructive">
            {requests.filter((item) => item.status === 'pending').length}{' '}
            pendentes
          </Badge>
          <Badge variant="secondary">
            {requests.filter((item) => item.status === 'processing').length} em
            processamento
          </Badge>
        </div>
      </div>
      <div className="border-border grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar cliente, NIF, email ou venda..."
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={setStatus}>
          <option value="active">Aguardando ação</option>
          <option value="all">Todos os estados</option>
          <option value="pending">Pendentes</option>
          <option value="processing">Em processamento</option>
          <option value="issued">Emitidas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="cancelled">Canceladas</option>
        </NativeSelect>
      </div>
      <div className="divide-border divide-y">
        {filtered.length ? (
          filtered.map((item) => (
            <article
              id={`invoice-request-${item.id}`}
              key={item.id}
              className="target:bg-primary/5 target:ring-primary/30 scroll-mt-24 p-4 target:ring-2"
            >
              <div className="flex flex-wrap items-start gap-4">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
                  <ReceiptText className="size-5" />
                </span>
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{item.fiscal_name}</h3>
                    <Badge
                      variant={
                        item.status === 'pending'
                          ? 'destructive'
                          : item.status === 'issued'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {invoiceRequestStatus(item.status)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    NIF {item.tax_id} · {item.email}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Solicitado em{' '}
                    {new Date(item.requested_at).toLocaleString('pt-PT')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-xs">Venda</p>
                  <strong>#{item.sale?.sale_number ?? '—'}</strong>
                  <p className="text-sm">
                    {money(
                      Number(item.sale?.total_amount ?? 0),
                      item.sale?.currency || 'EUR'
                    )}
                  </p>
                </div>
              </div>
              <div className="bg-muted/30 mt-4 grid gap-3 rounded-md p-3 text-xs md:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Morada fiscal</span>
                  <p className="mt-1">
                    {[
                      item.address_line,
                      item.postal_code,
                      item.city,
                      item.country,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Não informada'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Observação do cliente
                  </span>
                  <p className="mt-1">
                    {item.client_notes || 'Sem observação'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Processamento</span>
                  <p className="mt-1">
                    {item.invoice_number
                      ? `Fatura ${item.invoice_number}`
                      : item.admin_notes || 'Aguardando equipa'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {item.contact_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/contacts/${item.contact_id}`} />}
                  >
                    <CircleDollarSign /> Cliente 360
                  </Button>
                )}
                {item.sale_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/finance?tab=sales#sale-${item.sale_id}`} />
                    }
                  >
                    <ReceiptText /> Ver venda
                  </Button>
                )}
                {item.invoice_document_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `/api/finance/invoice-requests/${item.id}/document`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                  >
                    <ExternalLink /> Documento
                  </Button>
                )}
                {item.status === 'pending' && (
                  <Button
                    size="sm"
                    disabled={!canManage}
                    onClick={() => void updateStatus(item, 'processing')}
                  >
                    <FileClock /> Iniciar
                  </Button>
                )}
                {['pending', 'processing'].includes(item.status) && (
                  <>
                    <Button
                      size="sm"
                      disabled={!canManage}
                      onClick={() => openDecision(item, 'issue')}
                    >
                      <FileCheck2 /> Emitir
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!canManage}
                      onClick={() => openDecision(item, 'reject')}
                    >
                      <X /> Rejeitar
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            icon={FileClock}
            text="Nenhum pedido de fatura neste filtro."
          />
        )}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === 'issue'
                ? 'Concluir emissão da fatura'
                : 'Rejeitar pedido de fatura'}
            </DialogTitle>
            <DialogDescription>
              Venda #{selected?.sale?.sale_number}. A resposta ficará
              imediatamente visível no portal do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {mode === 'issue' && (
              <>
                <Field label="Número da fatura">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ex.: FT 2026/123"
                  />
                </Field>
                <Field label="Fatura em PDF">
                  <Input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) =>
                      setInvoiceFile(e.target.files?.[0] || null)
                    }
                  />
                  <span className="text-muted-foreground text-xs">
                    PDF até 10 MB. O documento ficará privado e disponível
                    apenas para este cliente.
                  </span>
                </Field>
              </>
            )}
            <Field
              label={
                mode === 'issue'
                  ? 'Nota para o cliente (opcional)'
                  : 'Motivo da rejeição'
              }
            >
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Voltar
            </Button>
            <Button
              variant={mode === 'reject' ? 'destructive' : 'default'}
              onClick={() => void finish()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : mode === 'issue' ? (
                <FileCheck2 />
              ) : (
                <X />
              )}
              {mode === 'issue' ? ' Confirmar emissão' : ' Rejeitar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function invoiceRequestStatus(status: FinanceInvoiceRequest['status']) {
  return {
    pending: 'Pendente',
    processing: 'Em processamento',
    issued: 'Emitida',
    rejected: 'Rejeitada',
    cancelled: 'Cancelada',
  }[status];
}

function SalesView({
  sales,
  currency,
  onPayment,
  onReverse,
  canOperate,
  canRefund,
  brand,
}: {
  sales: FinanceSale[];
  currency: string;
  onPayment: (sale: FinanceSale) => void;
  onReverse: (sale: FinanceSale) => void;
  canOperate: boolean;
  canRefund: boolean;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return sales.filter((sale) => {
      const matchesStatus =
        status === 'all' ||
        (status === 'active'
          ? !['voided', 'refunded'].includes(sale.status)
          : sale.status === status);
      const haystack =
        `${sale.sale_number} ${sale.contact?.name ?? ''} ${sale.contact?.phone ?? ''} ${(sale.items ?? []).map((item) => item.name_snapshot).join(' ')}`.toLocaleLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, sales, status]);

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar venda, cliente, telefone ou item..."
            className="pl-9"
          />
        </div>
        <NativeSelect value={status} onChange={setStatus}>
          <option value="active">Vendas operacionais</option>
          <option value="all">Todos os estados</option>
          <option value="open">Pendentes</option>
          <option value="partially_paid">Parciais</option>
          <option value="paid">Pagas</option>
          <option value="voided">Anuladas</option>
          <option value="refunded">Reembolsadas</option>
        </NativeSelect>
      </div>
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-2 text-xs">
        <span className="text-muted-foreground">
          {filtered.length} registos encontrados
        </span>
        <p className="text-muted-foreground">
          Pagamentos e alterações permanecem ligados à venda original.
        </p>
      </div>
      <div className="divide-border divide-y">
        {filtered.length === 0 ? (
          <Empty icon={ReceiptText} text="Ainda não existem vendas." />
        ) : (
          filtered.map((sale) => (
            <details
              key={sale.id}
              id={`sale-${sale.id}`}
              className="group target:bg-primary/5 target:ring-primary/30 scroll-mt-24 target:ring-2"
            >
              <summary className="grid cursor-pointer list-none items-center gap-3 p-4 md:grid-cols-[90px_1fr_130px_130px_auto]">
                <div>
                  <p className="font-mono text-xs">#{sale.sale_number}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {new Date(sale.created_at).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {sale.contact?.name ||
                      sale.contact?.phone ||
                      'Consumidor final'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {sale.items?.map((item) => item.name_snapshot).join(', ') ||
                      'Venda'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-medium">
                    {money(
                      Number(sale.total_amount),
                      sale.currency || currency
                    )}
                  </p>
                </div>
                <div>
                  <Badge
                    variant={sale.status === 'paid' ? 'default' : 'secondary'}
                  >
                    {SALE_STATUS[sale.status] ?? sale.status}
                  </Badge>
                  {Number(sale.balance_due) > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Falta{' '}
                      {money(
                        Number(sale.balance_due),
                        sale.currency || currency
                      )}
                    </p>
                  )}
                </div>
                <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-border bg-muted/20 border-t px-4 py-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Itens
                    </p>
                    <div className="space-y-1.5">
                      {(sale.items ?? []).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between gap-3 text-sm"
                        >
                          <span>
                            {item.quantity}× {item.name_snapshot}
                          </span>
                          <span className="shrink-0 font-medium">
                            {money(Number(item.line_total), sale.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase">
                      Pagamentos
                    </p>
                    <div className="space-y-1.5">
                      {(sale.payments ?? []).length ? (
                        sale.payments?.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span>
                              {PAYMENT_METHODS.find(
                                (method) => method.value === payment.method
                              )?.label ?? payment.method}{' '}
                              <span className="text-muted-foreground text-xs">
                                · {payment.status}
                              </span>
                            </span>
                            <strong>
                              {money(Number(payment.amount), sale.currency)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          Nenhum pagamento confirmado.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-40 flex-col gap-2">
                    {(sale.payments ?? []).length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadSaleReceipt(sale, brand)}
                      >
                        <Download /> Recibo PDF
                      </Button>
                    ) : null}
                    {Number(sale.balance_due) > 0 &&
                    !['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        size="sm"
                        disabled={!canOperate}
                        onClick={() => onPayment(sale)}
                      >
                        <CircleDollarSign /> Receber saldo
                      </Button>
                    ) : null}
                    {!['voided', 'refunded'].includes(sale.status) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !canOperate ||
                          (Number(sale.paid_amount) > 0 && !canRefund)
                        }
                        onClick={() => onReverse(sale)}
                      >
                        <RotateCcw />
                        {Number(sale.paid_amount) > 0 ? 'Reembolsar' : 'Anular'}
                      </Button>
                    ) : null}
                    {sale.contact?.id ? (
                      <Link
                        href={`/contacts/${sale.contact.id}`}
                        className="hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium"
                      >
                        Abrir Cliente 360 <ChevronRight className="size-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
                {sale.notes || sale.void_reason || sale.refund_reason ? (
                  <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                    {sale.refund_reason || sale.void_reason || sale.notes}
                  </p>
                ) : null}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

async function downloadSaleReceipt(
  sale: FinanceSale,
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null }
) {
  await downloadReceiptPdf({
    saleNumber: sale.sale_number,
    createdAt: sale.created_at,
    completedAt: sale.completed_at,
    currency: sale.currency,
    subtotal: Number(sale.subtotal),
    discountAmount: Number(sale.discount_amount),
    taxAmount: Number(sale.tax_amount),
    totalAmount: Number(sale.total_amount),
    paidAmount: Number(sale.paid_amount),
    balanceDue: Number(sale.balance_due),
    business: brand,
    client: {
      name: sale.contact?.name,
      email: sale.contact?.email,
      taxId: sale.contact?.tax_id,
      reference: sale.contact?.client_reference,
    },
    items: (sale.items ?? []).map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discount: Number(item.discount_amount),
      taxRate: Number(item.tax_rate),
      taxAmount: Number(item.tax_amount),
      total: Number(item.line_total),
    })),
    payments: (sale.payments ?? []).map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
      paidAt: payment.paid_at,
      status: payment.status,
      reference: payment.reference_code,
    })),
  });
}

function CashView({
  cashSession,
  sales,
  snapshot,
  movements,
  sessions,
  currency,
  canOperate,
  canDelete,
  onOpen,
  onClose,
  onMovement,
  onEditMovement,
  onDeleteMovement,
}: {
  cashSession: FinanceCashSession | null;
  sales: FinanceSale[];
  snapshot: FinanceCashSnapshot | null;
  movements: FinanceCashMovement[];
  sessions: FinanceCashSession[];
  currency: string;
  canOperate: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onClose: () => void;
  onMovement: () => void;
  onEditMovement: (movement: FinanceCashMovement) => void;
  onDeleteMovement: (movement: FinanceCashMovement) => void;
}) {
  const payments = sales
    .flatMap((sale) => sale.payments ?? [])
    .filter(
      (payment) =>
        payment.cash_session_id === cashSession?.id &&
        ['confirmed', 'refunded'].includes(payment.status)
    );
  const sessionMovements = movements.filter(
    (movement) => movement.cash_session_id === cashSession?.id
  );
  const movementLabels: Record<string, string> = {
    deposit: 'Reforço',
    withdrawal: 'Sangria',
    expense: 'Despesa',
    adjustment: 'Ajuste',
    refund: 'Reembolso',
    tip: 'Gorjeta',
  };
  const paymentTotals = snapshot?.payments_by_method ?? {};
  const tipMethodTotals = snapshot?.tips_by_method ?? {};
  const methodTotals = Object.fromEntries(
    PAYMENT_METHODS.map(({ value }) => [
      value,
      Number(paymentTotals[value] ?? 0) + Number(tipMethodTotals[value] ?? 0),
    ])
  ) as Record<FinancePaymentMethod, number>;
  const salesReceived = Object.values(paymentTotals).reduce(
    (total, amount) => total + Number(amount ?? 0),
    0
  );
  const tipTotals = Object.values(tipMethodTotals).reduce(
    (total, amount) => total + Number(amount ?? 0),
    0
  );
  const grandTotal = salesReceived + tipTotals;
  const cashReceived = Number(snapshot?.cash_received ?? 0);
  const expected = Number(snapshot?.expected_amount ?? 0);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.85fr)_minmax(0,1.15fr)]">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-violet-300 uppercase">
                Turno atual
              </p>
              <p className="mt-2 text-3xl font-black">
                {money(grandTotal, currency)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Recebimentos + gorjetas em todos os canais
              </p>
            </div>
            <span className="rounded-2xl bg-white/10 p-3 text-violet-200">
              <CircleDollarSign className="size-7" />
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-xs text-slate-400">Vendas recebidas</p>
              <p className="mt-1 font-bold">{money(salesReceived, currency)}</p>
            </div>
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.08] p-3">
              <p className="text-xs text-amber-200/70">Gorjetas</p>
              <p className="mt-1 font-bold text-amber-200">
                {money(tipTotals, currency)}
              </p>
            </div>
          </div>
        </div>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote /> Estado do caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cashSession ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Summary
                  label="Fundo inicial"
                  value={money(Number(cashSession.opening_amount), currency)}
                />
                <Summary
                  label="Recebido em dinheiro"
                  value={money(cashReceived, currency)}
                />
                <Summary
                  label="Entradas manuais"
                  value={money(Number(snapshot?.deposits ?? 0), currency)}
                />
                <Summary
                  label="Saídas e reembolsos"
                  value={money(Number(snapshot?.outflows ?? 0), currency)}
                />
                <Summary
                  label="Esperado no caixa"
                  value={money(expected, currency)}
                />
                <Summary
                  label="Aberto desde"
                  value={new Date(cashSession.opened_at).toLocaleTimeString(
                    'pt-PT',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={onMovement}
                  disabled={!canOperate}
                >
                  <HandCoins /> Movimento / gorjeta
                </Button>
                <Button
                  variant="destructive"
                  onClick={onClose}
                  disabled={!canOperate}
                >
                  Fechar e conferir
                </Button>
              </div>
            </div>
          ) : (
            <Empty
              icon={Banknote}
              text="O caixa está fechado. Abra-o antes de receber pagamentos em dinheiro."
              action="Abrir caixa"
              onClick={onOpen}
            />
          )}
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard /> Recebimentos por canal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGISTER_METHODS.map((method) => (
              <div
                key={method.value}
                className="bg-muted/60 rounded-xl border p-3"
              >
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  {method.value === 'cash' ? (
                    <Banknote className="size-3.5" />
                  ) : (
                    <CreditCard className="size-3.5" />
                  )}
                  {method.label}
                </div>
                <p className="mt-1.5 text-base font-bold">
                  {money(methodTotals[method.value], currency)}
                </p>
              </div>
            ))}
          </div>
          <div className="border-border mb-2 flex items-center justify-between border-t pt-4">
            <p className="text-sm font-semibold">Linha do tempo do turno</p>
            <Badge variant="outline">
              {payments.length + sessionMovements.length}
            </Badge>
          </div>
          <div className="max-h-[330px] space-y-1 overflow-y-auto pr-1">
            {payments.length || sessionMovements.length ? (
              [
                ...payments.map((payment) => ({
                  id: payment.id,
                  date: payment.paid_at,
                  label: `Venda · ${paymentMethodLabel(payment.method)}`,
                  amount: Number(payment.amount),
                  incoming: payment.status !== 'refunded',
                  method: payment.method,
                  source: 'payment' as const,
                  movement: null,
                })),
                ...sessionMovements.map((movement) => ({
                  id: movement.id,
                  date: movement.created_at,
                  label: `${movementLabels[movement.movement_type] ?? movement.movement_type} · ${movement.description}`,
                  amount: Number(movement.amount),
                  incoming: ['deposit', 'adjustment', 'tip'].includes(
                    movement.movement_type
                  ),
                  method: movement.payment_method || 'cash',
                  source: 'manual' as const,
                  movement,
                })),
              ]
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                .map((movement) => (
                  <div
                    key={movement.id}
                    className="border-border flex items-center justify-between border-b py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{movement.label}</p>
                      <span className="text-muted-foreground text-xs">
                        {paymentMethodLabel(movement.method)} ·{' '}
                        {new Date(movement.date).toLocaleString('pt-PT')}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <strong
                        className={
                          movement.incoming
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }
                      >
                        {movement.incoming ? '+' : '-'}
                        {money(movement.amount, currency)}
                      </strong>
                      {movement.source === 'manual' && movement.movement ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Editar lançamento"
                            disabled={!canOperate}
                            onClick={() => onEditMovement(movement.movement)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Excluir lançamento"
                            disabled={!canDelete}
                            onClick={() => onDeleteMovement(movement.movement)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-muted-foreground text-sm">
                Sem movimentos nesta sessão.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Fechos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 font-medium">Sessão</th>
                  <th className="py-2 font-medium">Abertura</th>
                  <th className="py-2 font-medium">Esperado</th>
                  <th className="py-2 font-medium">Contado</th>
                  <th className="py-2 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions
                  .filter((session) => session.status === 'closed')
                  .slice(0, 10)
                  .map((session) => (
                    <tr key={session.id}>
                      <td className="py-2">
                        {new Date(session.opened_at).toLocaleString('pt-PT')}
                      </td>
                      <td className="py-2">
                        {money(Number(session.opening_amount), currency)}
                      </td>
                      <td className="py-2">
                        {money(Number(session.expected_amount ?? 0), currency)}
                      </td>
                      <td className="py-2">
                        {money(
                          Number(session.closing_counted_amount ?? 0),
                          currency
                        )}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-medium',
                          Math.abs(Number(session.difference_amount ?? 0)) >
                            0.009 && 'text-destructive'
                        )}
                      >
                        {money(
                          Number(session.difference_amount ?? 0),
                          currency
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canConfigure && (
          <Button onClick={onCreate}>
            <Plus /> Criar pack
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Catálogo de packs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {packs.length ? (
              packs.map((pack) => (
                <div
                  key={pack.id}
                  className="border-border rounded-md border p-3"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium">{pack.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {pack.items
                          ?.map(
                            (item) =>
                              `${item.sessions}× ${item.service?.name ?? 'Serviço'}`
                          )
                          .join(' · ')}
                      </p>
                    </div>
                    <strong>
                      {money(Number(pack.price), pack.currency || currency)}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon={PackageCheck}
                text="Crie packs de sessões para vender no POS."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Packs dos clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientPacks.length ? (
              clientPacks.map((item) => {
                const purchased = (item.balances ?? []).reduce(
                  (sum, balance) => sum + Number(balance.total_sessions),
                  0
                );
                const available = (item.balances ?? []).reduce(
                  (sum, balance) => sum + Number(balance.remaining_sessions),
                  0
                );
                const used = purchased - available;
                return (
                  <div
                    key={item.id}
                    className="border-border rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {item.contact?.name || item.contact?.phone}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {item.pack?.name} · expira{' '}
                          {item.expires_at
                            ? new Date(item.expires_at).toLocaleDateString(
                                'pt-PT'
                              )
                            : 'sem validade'}
                        </p>
                        <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                          {item.code ?? 'Código pendente'} · PIN{' '}
                          {item.pin_code ?? 'pendente'}
                        </p>
                      </div>
                      <Badge variant="secondary">{item.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border text-center">
                      <PackQuantity label="Compradas" value={purchased} />
                      <PackQuantity label="Utilizadas" value={used} />
                      <PackQuantity label="Disponíveis" value={available} />
                    </div>
                    {(item.balances ?? []).length ? (
                      <div className="mt-2 space-y-1">
                        {item.balances?.map((balance) => (
                          <div
                            key={balance.id}
                            className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="truncate">
                              {balance.service?.name ?? 'Serviço'}
                            </span>
                            <span className="shrink-0 font-medium">
                              {balance.remaining_sessions}/
                              {balance.total_sessions} disponíveis
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <BenefitLogList
                      logs={logs.filter(
                        (log) => log.client_pack_id === item.id
                      )}
                      sourceHref={
                        item.sale_id
                          ? `/finance?tab=sales#sale-${item.sale_id}`
                          : undefined
                      }
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhum pack vendido.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function VouchersView({
  vouchers,
  logs,
  currency,
  brand,
  onSell,
}: {
  vouchers: FinanceVoucher[];
  logs: FinanceBenefitLog[];
  currency: string;
  brand: { name: string; logoUrl?: string | null; publicUrl?: string | null };
  onSell: () => void;
}) {
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);

  async function generatePdf(voucher: FinanceVoucher) {
    setGeneratingCode(voucher.code);
    try {
      await downloadVoucherPdf(voucher, brand);
      toast.success('PDF do voucher criado.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o PDF do voucher.'
      );
    } finally {
      setGeneratingCode(null);
    }
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Vouchers emitidos</h2>
          <p className="text-muted-foreground text-xs">
            Saldo, validade e titular de cada vale.
          </p>
        </div>
        <Button onClick={onSell}>
          <Gift /> Vender voucher
        </Button>
      </div>
      <div className="divide-border divide-y">
        {vouchers.length ? (
          vouchers.map((voucher) => (
            <div key={voucher.id} className="p-4">
              <div className="grid items-center gap-3 md:grid-cols-[150px_1fr_140px_110px_auto]">
                <div>
                  <span className="bg-muted block rounded-md px-2 py-1 font-mono text-xs">
                    {voucher.code}
                  </span>
                  <p className="text-muted-foreground mt-1 text-[10px]">
                    PIN {voucher.pin_code ?? 'não definido'}
                  </p>
                </div>
                <div>
                  <p className="font-medium">
                    {voucher.voucher_type === 'service'
                      ? voucher.service?.name || 'Voucher de serviço'
                      : 'Cartão-presente'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {voucher.recipient_name ||
                      voucher.owner?.name ||
                      'Sem destinatário'}{' '}
                    ·{' '}
                    {voucher.expires_at
                      ? `até ${new Date(voucher.expires_at).toLocaleDateString('pt-PT')}`
                      : 'sem limite'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">
                    {voucher.voucher_type === 'service'
                      ? 'Utilizações'
                      : 'Saldo'}
                  </p>
                  <strong>
                    {voucher.voucher_type === 'service'
                      ? `${voucher.remaining_uses ?? 0}/1 disponível`
                      : money(
                          Number(voucher.current_balance),
                          voucher.currency || currency
                        )}
                  </strong>
                  <p className="text-muted-foreground text-[10px]">
                    Utilizado:{' '}
                    {voucher.voucher_type === 'service'
                      ? `${1 - Number(voucher.remaining_uses ?? 0)} sessão`
                      : money(
                          Number(voucher.initial_balance) -
                            Number(voucher.current_balance),
                          voucher.currency || currency
                        )}
                  </p>
                </div>
                <Badge
                  variant={
                    voucher.status === 'active' ? 'default' : 'secondary'
                  }
                >
                  {voucher.status}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={generatingCode === voucher.code}
                  onClick={() => void generatePdf(voucher)}
                  title="Baixar vale-presente em PDF"
                >
                  {generatingCode === voucher.code ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  Baixar PDF
                </Button>
              </div>
              <BenefitLogList
                logs={logs.filter((log) => log.voucher_id === voucher.id)}
                sourceHref={
                  voucher.issued_sale_id
                    ? `/finance?tab=sales#sale-${voucher.issued_sale_id}`
                    : undefined
                }
              />
            </div>
          ))
        ) : (
          <Empty icon={Gift} text="Nenhum voucher emitido." />
        )}
      </div>
    </section>
  );
}

const BENEFIT_LOG_LABEL: Record<FinanceBenefitLog['action'], string> = {
  issued: 'Emitido',
  reserved: 'Reservado numa marcação',
  used: 'Utilizado',
  released: 'Reserva libertada',
  cancelled: 'Cancelado',
  adjusted: 'Ajustado',
};

function BenefitLogList({
  logs,
  sourceHref,
}: {
  logs: FinanceBenefitLog[];
  sourceHref?: string;
}) {
  return (
    <details className="border-border mt-3 border-t pt-2">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium">
        Ver histórico completo ({logs.length})
      </summary>
      <div className="mt-2 space-y-2">
        {logs.length ? (
          logs.map((log) => {
            const href = log.appointment?.id
              ? `/agenda?appointment=${log.appointment.id}${
                  log.appointment.scheduled_start
                    ? `&date=${log.appointment.scheduled_start.slice(0, 10)}`
                    : ''
                }`
              : sourceHref;
            const content = (
              <div
                className={cn(
                  'bg-muted/50 rounded-md p-2.5 text-xs',
                  href && 'hover:bg-muted transition-colors'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{BENEFIT_LOG_LABEL[log.action]}</strong>
                  <span className="text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('pt-PT')}
                  </span>
                </div>
                {log.appointment ? (
                  <p className="text-muted-foreground mt-1">
                    {log.appointment.service?.name ?? 'Atendimento'} ·{' '}
                    {log.appointment.contact?.name ||
                      log.appointment.contact?.phone ||
                      'Cliente'}
                    {log.appointment.scheduled_start
                      ? ` · ${new Date(log.appointment.scheduled_start).toLocaleString('pt-PT')}`
                      : ''}
                  </p>
                ) : null}
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Realizado por: {log.performed_by_name || 'Sistema'}
                  </span>
                  {log.approved_by_name ? (
                    <span>Aprovado por: {log.approved_by_name}</span>
                  ) : null}
                  {Number(log.amount) > 0 ? (
                    <span>Valor: {Number(log.amount).toFixed(2)}</span>
                  ) : null}
                  {Number(log.sessions) > 0 ? (
                    <span>Sessões: {log.sessions}</span>
                  ) : null}
                </div>
                {href ? (
                  <p className="text-primary mt-2 text-[11px] font-medium">
                    Abrir registo original
                  </p>
                ) : null}
              </div>
            );
            return href ? (
              <Link key={log.id} href={href} className="block">
                {content}
              </Link>
            ) : (
              <div key={log.id}>{content}</div>
            );
          })
        ) : (
          <p className="text-muted-foreground py-2 text-xs">
            Nenhum evento registado.
          </p>
        )}
      </div>
    </details>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-md p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function FinanceMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ReceiptText;
}) {
  return (
    <div className="border-border bg-card flex min-w-0 items-start justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold">{value}</p>
        <p className="text-muted-foreground mt-1 truncate text-[11px]">
          {detail}
        </p>
      </div>
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-4" />
      </div>
    </div>
  );
}

function PackQuantity({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border px-2 py-2 not-last:border-r">
      <p className="text-muted-foreground text-[10px] uppercase">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
function NativeSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background focus:border-ring focus:ring-ring/30 h-9 min-w-0 rounded-md border px-3 text-sm outline-none focus:ring-2"
    >
      {children}
    </select>
  );
}
function Empty({
  icon: Icon,
  text,
  action,
  onClick,
}: {
  icon: typeof ReceiptText;
  text: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="text-muted-foreground flex min-h-40 flex-col items-center justify-center p-6 text-center text-sm">
      <Icon className="mb-2 size-6" />
      <p>{text}</p>
      {action && onClick && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}

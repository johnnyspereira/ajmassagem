'use client';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, Gift, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/currency';
type Order = {
  sale_id?: string | null;
  sale_status?: string | null;
  balance_due?: number | null;
  paid_amount?: number | null;
  total_amount?: number | null;
  payment_method?: string | null;
};
export function CampaignStorePurchase({
  campaign,
  slug,
  balance,
  disabled,
  onRefresh,
}: {
  campaign: {
    id: string;
    title: string;
    commerce_price?: number | null;
    campaign_kind?: string;
    enrollment: Order | null;
  };
  slug: string;
  balance: number;
  disabled: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    paid?: boolean;
    mbwayPhone?: string;
    reference?: string;
    due?: number;
  } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pending =
    campaign.enrollment?.sale_id &&
    !['voided', 'refunded'].includes(campaign.enrollment.sale_status || '');
  const total =
    Number(
      pending
        ? (campaign.enrollment?.total_amount ?? campaign.commerce_price)
        : campaign.commerce_price
    ) || 0;
  const used = pending
    ? Number(campaign.enrollment?.paid_amount) || 0
    : campaign.campaign_kind === 'exchange'
      ? Math.min(total, Math.max(0, balance))
      : 0;
  const due =
    Math.round(
      (pending
        ? Number(campaign.enrollment?.balance_due ?? total - used)
        : total - used) * 100
    ) / 100;
  const paid = campaign.enrollment?.sale_status === 'paid' || result?.paid;
  const selected = (pending && campaign.enrollment?.payment_method) || method;
  async function purchase() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/portal/${encodeURIComponent(slug)}/campaigns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: campaign.id,
            paymentMethod: due <= 0 ? 'wallet' : selected,
            quote: { total, wallet: used, due },
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível concluir a compra.');
      if (!alive.current) return;
      if (payload.checkoutUrl) {
        window.location.assign(payload.checkoutUrl);
        return;
      }
      setResult(payload);
      await onRefresh();
    } catch (error) {
      if (alive.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a compra.'
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="min-h-12 w-full rounded-xl whitespace-normal"
        disabled={(disabled && !pending) || Boolean(paid)}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        <Gift />
        {paid
          ? 'Compra concluída'
          : pending
            ? 'Retomar compra'
            : `Comprar por ${formatCurrency(total, 'EUR')}`}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{campaign.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 space-y-3 rounded-xl p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span>Valor da campanha</span>
                <strong>{formatCurrency(total, 'EUR')}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Wallet className="size-4" />
                  {pending ? 'Já registado' : 'Saldo a utilizar'}
                </span>
                <strong>{formatCurrency(used, 'EUR')}</strong>
              </div>
              <div className="flex justify-between gap-3 border-t pt-3 text-base">
                <span>Diferença a pagar</span>
                <strong>{formatCurrency(due, 'EUR')}</strong>
              </div>
            </div>
            {paid ? (
              <p
                role="status"
                className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
              >
                Compra paga. O voucher ou pack já está disponível em Benefícios
                e saldo.
              </p>
            ) : result?.mbwayPhone ? (
              <div
                role="status"
                className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              >
                <p>
                  Transfira{' '}
                  <strong>{formatCurrency(Number(result.due), 'EUR')}</strong>{' '}
                  por MB WAY para:
                </p>
                <p className="text-2xl font-semibold">{result.mbwayPhone}</p>
                <p>
                  Referência: <strong>{result.reference}</strong>
                </p>
                <p>
                  A compra fica a aguardar confirmação da equipa. Envie o
                  comprovativo com esta referência. O voucher ou pack será
                  ativado após a receção do pagamento ser confirmada.
                </p>
              </div>
            ) : (
              <>
                {due > 0 && (
                  <fieldset
                    disabled={
                      busy ||
                      Boolean(pending && campaign.enrollment?.payment_method)
                    }
                    className="space-y-2"
                  >
                    <legend className="mb-2 text-sm font-medium">
                      Como pretende pagar a diferença?
                    </legend>
                    {[
                      ['card', 'Cartão'],
                      ['mbway', 'MB WAY por telemóvel'],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${selected === value ? 'border-primary bg-primary/5' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`campaign-payment-${campaign.id}`}
                          value={value}
                          checked={selected === value}
                          onChange={() => setMethod(value)}
                        />
                        {value === 'card' && <CreditCard className="size-4" />}
                        {label}
                      </label>
                    ))}
                  </fieldset>
                )}
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Ao confirmar, o saldo indicado é descontado do cartão e ligado
                  a esta compra. O benefício só fica disponível após pagamento
                  integral. Para cancelar uma compra pendente e devolver o
                  saldo, contacte a equipa.
                </p>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Fechar
              </Button>
              {!paid && !result?.mbwayPhone && (
                <Button
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void purchase()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wallet className="size-4" />
                  )}
                  {due <= 0
                    ? 'Confirmar compra com saldo'
                    : selected === 'card'
                      ? 'Continuar para cartão'
                      : 'Confirmar e ver MB WAY'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

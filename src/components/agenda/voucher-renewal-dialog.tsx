'use client';
import { useEffect, useState } from 'react';
import { Gift, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

type Preview = {
  eligible: boolean;
  reason: string | null;
  service: string;
  amount: number;
  currency: string;
  message: string;
  mbwayPhone: string;
  history: null | {
    status: string;
    sent_at: string | null;
    sale_id: string | null;
    payment_status: string | null;
  };
};
export function VoucherRenewalDialog({
  appointmentId,
  onClose,
}: {
  appointmentId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null),
    [message, setMessage] = useState(''),
    [mbwayPhone, setMbwayPhone] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    setConfirm(false);
    fetch(`/api/clinic/appointments/${appointmentId}/renewal`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || 'Não foi possível verificar a renovação.'
          );
        setData(body);
        setMessage(body.message);
        setMbwayPhone(body.mbwayPhone);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [appointmentId]);
  async function send() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/clinic/appointments/${appointmentId}/renewal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true, message, mbwayPhone }),
        }
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || 'Não foi possível enviar a oferta.');
      toast.success(
        'Oferta aceite pelo canal WhatsApp. O pagamento será confirmado separadamente.'
      );
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha no envio.');
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!appointmentId}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="text-primary size-5" />
            Renovar esta experiência
          </DialogTitle>
          <DialogDescription>
            Oferta individual após consumir o último voucher da modalidade.
          </DialogDescription>
        </DialogHeader>
        {!data && !error ? (
          <p className="flex items-center gap-2 py-6">
            <Loader2 className="size-4 animate-spin" />A verificar todos os
            vouchers do cliente…
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-sm"
          >
            {error}
          </p>
        ) : null}
        {data ? (
          <>
            <div className="bg-muted/40 rounded-xl border p-4">
              <p className="font-medium">
                {data.service || 'Verificação da modalidade'}
              </p>
              {data.amount > 0 ? (
                <p className="mt-1 text-2xl font-semibold">
                  {new Intl.NumberFormat('pt-PT', {
                    style: 'currency',
                    currency: data.currency,
                  }).format(data.amount)}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-1 text-xs">
                Valor realmente pago pelo voucher utilizado, com desconto
                incluído. Um novo voucher para uma sessão, com validade de 365
                dias desde a criação da compra.
              </p>
            </div>
            {data.history ? (
              <div className="rounded-xl border p-4 text-sm">
                <p className="font-medium">
                  Já existe uma oferta para este voucher
                </p>
                <p>
                  {data.history.payment_status === 'paid'
                    ? 'Renovação paga'
                    : data.history.sale_id
                      ? 'Compra criada — consulte o estado no Financeiro'
                      : 'Cliente ainda sem compra criada'}
                </p>
                <p>
                  {data.history.status === 'sent'
                    ? 'Envio aceite pelo WhatsApp'
                    : data.history.status === 'uncertain'
                      ? 'Resultado do envio por confirmar — consulte o Inbox'
                      : 'Preparação ou envio em curso'}
                </p>
                {data.history.sale_id ? (
                  <a
                    className="text-primary mt-2 inline-block underline"
                    href={`/finance?tab=sales#sale-${data.history.sale_id}`}
                  >
                    Consultar compra e pagamento
                  </a>
                ) : null}
              </div>
            ) : data.eligible ? (
              <>
                <label htmlFor="renewal-mbway" className="text-sm font-medium">
                  Número MB WAY para receber a transferência
                </label>
                <Input
                  id="renewal-mbway"
                  type="tel"
                  value={mbwayPhone}
                  onChange={(event) => {
                    setMbwayPhone(event.target.value);
                    setConfirm(false);
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Confirme o número antes de enviar. O pagamento por MB WAY é
                  confirmado manualmente no Financeiro.
                </p>
                <label
                  htmlFor="renewal-message"
                  className="text-sm font-medium"
                >
                  Mensagem para rever e personalizar
                </label>
                <Textarea
                  id="renewal-message"
                  className="min-h-64 text-base sm:text-sm"
                  maxLength={4000}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setConfirm(false);
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  O link individual é acrescentado ao enviar e a oferta é válida
                  apenas hoje, até às 23:59 de Lisboa. Cartão ou transferência
                  MB WAY para o número indicado. Enviar não cobra nem ativa o
                  novo voucher.
                </p>
                {confirm ? (
                  <div className="border-primary/30 bg-primary/5 rounded-xl border p-4 text-sm">
                    <p className="font-medium">
                      Enviar esta oferta ao cliente por WhatsApp?
                    </p>
                    <p className="text-muted-foreground mt-1">
                      As autorizações e os vouchers serão novamente verificados
                      antes do envio.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={confirm ? () => setConfirm(false) : onClose}
                  >
                    {confirm ? 'Voltar à revisão' : 'Fechar'}
                  </Button>
                  <Button
                    disabled={busy || !message.trim()}
                    onClick={confirm ? send : () => setConfirm(true)}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {confirm ? 'Sim, enviar por WhatsApp' : 'Rever envio'}
                  </Button>
                </div>
              </>
            ) : (
              <p role="status" className="rounded-xl border p-4 text-sm">
                {data.reason}
              </p>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

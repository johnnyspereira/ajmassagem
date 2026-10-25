'use client';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from './finance-ui';
import {
  accountDateInput,
  accountTimeInput,
  accountDateTimeToUtc,
} from '@/lib/timezone';
export function FinanceExpenseDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const requestId = useRef('');
  const [accounts, setAccounts] = useState<
      { id: string; name: string; currency: string; account_type: string }[]
    >([]),
    [fund, setFund] = useState(''),
    [method, setMethod] = useState('bank_transfer'),
    [amount, setAmount] = useState(''),
    [description, setDescription] = useState(''),
    [date, setDate] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    requestId.current = crypto.randomUUID();
    const controller = new AbortController();
    queueMicrotask(() => {
      setAmount('');
      setDescription('');
      setFund('');
      setMethod('bank_transfer');
      setError('');
      const now = new Date();
      setDate(
        `${accountDateInput(now, 'Europe/Lisbon')}T${accountTimeInput(now, 'Europe/Lisbon')}`
      );
    });
    fetch('/api/finance/expenses', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || 'Não foi possível consultar as contas.'
          );
        setAccounts(data.accounts || []);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [open]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const [day, time] = date.split('T');
      const response = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId.current,
          amount: Number(amount),
          description,
          fundAccountId: fund,
          paymentMethod: method,
          occurredAt: accountDateTimeToUtc(
            day,
            time,
            'Europe/Lisbon'
          ).toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível registar a saída.');
      toast.success(
        data.recordedIn === 'cash'
          ? 'Saída registada no caixa aberto.'
          : 'Saída registada na conta financeira.'
      );
      onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar saída</DialogTitle>
          <DialogDescription>
            Registe uma despesa já paga. Para uma conta a pagar no futuro, use
            Nova conta na Tesouraria.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <label className="space-y-1 text-sm">
          De onde saiu o dinheiro?
          <NativeSelect value={fund} onChange={setFund}>
            <option value="">Dinheiro físico / caixa</option>
            {accounts
              .filter((item) => item.account_type !== 'cash')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
          </NativeSelect>
        </label>
        <p className="text-muted-foreground text-xs">
          Dinheiro físico usa o caixa aberto, se existir; com o caixa fechado
          fica registado na conta de dinheiro físico. Uma conta bancária não
          altera as notas e moedas do caixa.
        </p>
        {fund ? (
          <label className="space-y-1 text-sm">
            Como foi pago?
            <NativeSelect value={method} onChange={setMethod}>
              <option value="bank_transfer">Transferência</option>
              <option value="card">Cartão</option>
              <option value="mb_way">MB WAY</option>
              <option value="multibanco">Multibanco</option>
              <option value="other">Outro</option>
            </NativeSelect>
          </label>
        ) : null}
        <label className="space-y-1 text-sm">
          Valor
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="space-y-1 text-sm">
          Descrição
          <Input
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: produtos de limpeza, renda ou material"
            disabled={busy}
          />
        </label>
        <label className="space-y-1 text-sm">
          Data e hora · Lisboa
          <Input
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={
              busy || !description.trim() || !(Number(amount) > 0) || !date
            }
          >
            {busy ? 'A guardar…' : 'Registar saída'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

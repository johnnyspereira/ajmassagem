'use client';
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { accountDateInput } from '@/lib/timezone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function useBenefitClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function BenefitValidityButton({
  kind,
  id,
  code,
  expiresAt,
  status,
  onUpdated,
}: {
  kind: 'voucher' | 'pack';
  id: string;
  code?: string | null;
  expiresAt?: string | null;
  status: string;
  onUpdated?: () => void;
}) {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false),
    [day, setDay] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  if (!isOwner || !['active', 'expired'].includes(status)) return null;
  async function save() {
    setBusy(true);
    try {
      const response = await fetch('/api/finance/benefits/validity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, expiresOn: day, reason }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Não foi possível alterar a validade.');
      toast.success('Validade atualizada e decisão registada.');
      setOpen(false);
      if (onUpdated) onUpdated();
      else window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar a validade.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDay(
            expiresAt
              ? accountDateInput(new Date(expiresAt), 'Europe/Lisbon')
              : accountDateInput(new Date(), 'Europe/Lisbon')
          );
          setReason('');
          setOpen(true);
        }}
      >
        <CalendarDays className="size-4" /> Alterar validade
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Alterar validade do {kind === 'voucher' ? 'voucher' : 'pack'}
            </DialogTitle>
            <DialogDescription>
              {code} · Decisão exclusiva do proprietário, guardada no histórico.
              Mantém o saldo e as sessões existentes.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm">
            Válido até (Lisboa)
            <Input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Motivo da alteração
            <Input
              value={reason}
              maxLength={500}
              placeholder="Ex.: prolongamento autorizado ao cliente"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p className="text-muted-foreground text-xs">
            A validade termina no fim do dia escolhido. Esta ação não envia
            mensagens nem modifica o PDF já emitido. Para uma exceção sem
            prolongar a validade, use a autorização na marcação.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy || !day || reason.trim().length < 5}
              onClick={() => void save()}
            >
              {busy ? 'A guardar…' : 'Guardar validade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

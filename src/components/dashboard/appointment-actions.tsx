'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface ActionAppointment {
  id: string;
  contactName: string;
  scheduledStart: string;
  href: string;
  status?: string;
  kind?: string;
  requestedStart?: string | null;
}
function dateInputValue(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function AppointmentActions({
  appointment,
  onChanged,
}: {
  appointment: ActionAppointment;
  onChanged: (id: string) => void;
}) {
  const { isViewer } = useAuth();
  const [action, setAction] = useState<
    'confirm' | 'cancel' | 'reschedule' | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (
    isViewer ||
    (appointment.status &&
      !['scheduled', 'confirmed'].includes(appointment.status))
  )
    return null;
  function open(next: NonNullable<typeof action>) {
    setAction(next);
    setStartsAt(
      dateInputValue(appointment.requestedStart || appointment.scheduledStart)
    );
    setReason('');
    setError(null);
  }
  async function submit() {
    if (!action || busy) return;
    if (
      action === 'reschedule' &&
      (!startsAt || !Number.isFinite(new Date(startsAt).getTime()))
    ) {
      setError('Escolha a nova data e hora.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/clinic/appointments/${appointment.id}/dashboard-action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            reason,
            expectedStart: new Date(appointment.scheduledStart).toISOString(),
            expectedStatus: appointment.status,
            startsAt:
              action === 'reschedule'
                ? new Date(startsAt).toISOString()
                : undefined,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Não foi possível guardar a alteração.'
        );
      toast.success(
        action === 'confirm'
          ? 'Marcação confirmada.'
          : action === 'cancel'
            ? 'Marcação cancelada.'
            : 'Marcação reagendada.'
      );
      if (result.warning) toast.warning(result.warning);
      setAction(null);
      onChanged(appointment.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível guardar. Tente novamente.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {appointment.status !== 'confirmed' &&
          appointment.kind !== 'reschedule' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => open('confirm')}
              className="border-emerald-600/25 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
            >
              <Check className="size-3.5" />
              Confirmar
            </Button>
          )}
        <Button size="sm" variant="outline" onClick={() => open('reschedule')}>
          <CalendarClock className="size-3.5" />
          Reagendar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => open('cancel')}
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400"
        >
          <X className="size-3.5" />
          Cancelar
        </Button>
      </div>
      <Dialog
        open={action !== null}
        onOpenChange={(opened) => {
          if (!opened && !busy) setAction(null);
        }}
      >
        <DialogContent showCloseButton={!busy} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'confirm'
                ? 'Confirmar marcação'
                : action === 'cancel'
                  ? 'Cancelar marcação'
                  : 'Reagendar marcação'}
            </DialogTitle>
            <DialogDescription>
              {appointment.contactName} ·{' '}
              {new Date(appointment.scheduledStart).toLocaleString('pt-PT', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            {action === 'reschedule' && (
              <div className="space-y-2">
                <Label htmlFor={`date-${appointment.id}`}>
                  Nova data e hora
                </Label>
                <Input
                  id={`date-${appointment.id}`}
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                  disabled={busy}
                />
                <p className="text-muted-foreground text-xs">
                  A duração mantém-se. A disponibilidade do profissional e da
                  sala será verificada.
                </p>
              </div>
            )}
            {action !== 'confirm' && (
              <div className="space-y-2">
                <Label htmlFor={`reason-${appointment.id}`}>
                  Motivo{action === 'reschedule' ? ' (opcional)' : ''}
                </Label>
                <Input
                  id={`reason-${appointment.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required={action === 'cancel'}
                  minLength={action === 'cancel' ? 3 : undefined}
                  maxLength={1000}
                  disabled={busy}
                  placeholder="Motivo da alteração"
                />
              </div>
            )}
            <p className="text-muted-foreground text-sm">
              {action === 'cancel'
                ? 'O cliente será notificado e os vouchers ou sessões de pack reservados serão devolvidos. Marcações com pagamentos exigem o processo de cancelamento na agenda.'
                : 'A alteração ficará registada na agenda e o cliente será notificado.'}
            </p>
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
              >
                {error}
                <Link
                  href={appointment.href}
                  className="mt-2 block font-semibold underline"
                >
                  Abrir marcação na agenda
                </Link>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={busy}
                variant={action === 'cancel' ? 'destructive' : 'default'}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy
                  ? 'A guardar…'
                  : action === 'confirm'
                    ? 'Confirmar marcação'
                    : action === 'cancel'
                      ? 'Cancelar marcação'
                      : 'Guardar novo horário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

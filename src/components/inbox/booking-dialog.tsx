'use client';
import { useEffect, useState, useRef } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { accountDateInput, accountDateTimeToUtc } from '@/lib/timezone';
import { formatCurrency } from '@/lib/currency';
import {
  findAvailabilityConflicts,
  availabilityConflictMessage,
} from '@/lib/clinic/agenda-availability';
import type { Contact, ClinicService, ClinicRoom, Profile } from '@/types';
import type { InboxBookingBenefit } from '@/lib/inbox/available-benefits';
import { availableVoucher, usableExpiry } from '@/lib/inbox/available-benefits';
import type { FinanceVoucher } from '@/types';

export function InboxBookingDialog({
  contact,
  benefit,
  onClose,
  onCreated,
}: {
  contact: Contact;
  benefit: InboxBookingBenefit | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { accountId, user, account, defaultCurrency, canSendMessages } =
    useAuth();
  const zone = account?.timezone || 'Europe/Lisbon';
  const [services, setServices] = useState<ClinicService[]>([]);
  const [professionals, setProfessionals] = useState<Profile[]>([]);
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [serviceId, setServiceId] = useState(benefit?.serviceId || '');
  const [professionalId, setProfessionalId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState(() => accountDateInput(new Date(), zone));
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const service = services.find((item) => item.id === serviceId);
  useEffect(() => {
    let cancelled = false;
    const db = createClient();
    void Promise.all([
      db
        .from('clinic_services')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      db
        .from('profiles')
        .select('*')
        .eq('is_professional', true)
        .order('full_name'),
      db.from('clinic_rooms').select('*').eq('is_active', true).order('name'),
    ]).then(([s, p, r]) => {
      if (cancelled) return;
      if (s.error || p.error || r.error)
        setLoadError(
          'Não foi possível carregar os dados da agenda. Feche e tente novamente.'
        );
      setServices(
        ((s.data || []) as ClinicService[]).filter(
          (item) => item.internal_booking_enabled !== false && !item.coming_soon
        )
      );
      const people = (p.data || []) as Profile[];
      setProfessionals(people);
      setRooms((r.data || []) as ClinicRoom[]);
      if (people.length === 1) setProfessionalId(people[0].id);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (
      lock.current ||
      !accountId ||
      !user ||
      !service ||
      !professionalId ||
      !date ||
      !time ||
      !canSendMessages
    )
      return;
    lock.current = true;
    setSaving(true);
    const db = createClient();
    let createdId: string | null = null;
    let committed = false;
    try {
      const start = accountDateTimeToUtc(date, time, zone);
      const end = new Date(
        start.getTime() + Number(service.duration_minutes) * 60000
      );
      if (
        !Number.isFinite(start.getTime()) ||
        end <= start ||
        start < new Date()
      )
        throw new Error('Escolha uma data e hora futuras.');
      const [appointments, blocks] = await Promise.all([
        db
          .from('clinic_appointments')
          .select(
            'id,scheduled_start,scheduled_end,professional_profile_id,room_id,status'
          )
          .lt('scheduled_start', end.toISOString())
          .gt('scheduled_end', start.toISOString()),
        db
          .from('clinic_time_blocks')
          .select('id,starts_at,ends_at,professional_profile_id,room_id')
          .lt('starts_at', end.toISOString())
          .gt('ends_at', start.toISOString()),
      ]);
      if (appointments.error || blocks.error)
        throw new Error(
          'Não foi possível validar a disponibilidade. Tente novamente.'
        );
      const resources = [
        ...(appointments.data || []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          startsAt: String(row.scheduled_start),
          endsAt: String(row.scheduled_end),
          professionalId: row.professional_profile_id as string,
          roomId: row.room_id as string,
          status: row.status as string,
          kind: 'appointment' as const,
        })),
        ...(blocks.data || []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          startsAt: String(row.starts_at),
          endsAt: String(row.ends_at),
          professionalId: row.professional_profile_id as string,
          roomId: row.room_id as string,
          kind: 'time_block' as const,
        })),
      ];
      const conflict = availabilityConflictMessage(
        findAvailabilityConflicts(resources, {
          startsAt: start,
          endsAt: end,
          professionalId,
          roomId: roomId || null,
        })
      );
      if (conflict) throw new Error(conflict);
      if (benefit?.type === 'voucher') {
        const [voucher, holds] = await Promise.all([
          db
            .from('finance_vouchers')
            .select('*')
            .eq('id', benefit.id)
            .eq('owner_contact_id', contact.id)
            .single(),
          db
            .from('finance_appointment_benefits')
            .select('voucher_id,reserved_amount,status')
            .eq('voucher_id', benefit.id)
            .eq('status', 'reserved'),
        ]);
        if (
          voucher.error ||
          holds.error ||
          !voucher.data ||
          !availableVoucher(voucher.data as FinanceVoucher, holds.data || [])
        )
          throw new Error(
            'Este voucher deixou de estar disponível. Atualize o painel do cliente.'
          );
        if (
          voucher.data.voucher_type === 'service' &&
          voucher.data.service_id !== service.id
        )
          throw new Error('O voucher não é válido para este serviço.');
      }
      if (benefit?.type === 'pack') {
        const pack = await db
          .from('finance_client_packs')
          .select('status,expires_at')
          .eq('id', benefit.id)
          .eq('contact_id', contact.id)
          .single();
        if (
          pack.error ||
          !pack.data ||
          pack.data.status !== 'active' ||
          !usableExpiry(pack.data.expires_at)
        )
          throw new Error(
            'Este pack deixou de estar disponível. Atualize o painel do cliente.'
          );
      }
      const { data, error } = await db
        .from('clinic_appointments')
        .insert({
          account_id: accountId,
          user_id: user.id,
          contact_id: contact.id,
          service_id: service.id,
          professional_profile_id: professionalId,
          room_id: roomId || null,
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          original_scheduled_start: start.toISOString(),
          original_scheduled_end: end.toISOString(),
          status: 'scheduled',
          source: 'manual',
          price: Number(service.price),
          original_price: Number(service.price),
          currency: service.currency || defaultCurrency,
          notes: notes.trim() || null,
        })
        .select('id,scheduled_start,scheduled_end')
        .single();
      if (error || !data?.id)
        throw new Error(
          error?.message || 'Não foi possível guardar a marcação.'
        );
      createdId = data.id;
      if (
        new Date(data.scheduled_start).getTime() !== start.getTime() ||
        new Date(data.scheduled_end).getTime() !== end.getTime()
      )
        throw new Error(
          'O servidor devolveu um horário diferente. A marcação será anulada; tente novamente depois de verificar o fuso horário.'
        );
      if (benefit) {
        const result = await db.rpc('set_appointment_benefit', {
          p_appointment_id: createdId,
          p_benefit_type: benefit.type,
          p_source_id: benefit.id,
        });
        if (result.error) throw new Error(result.error.message);
      }
      committed = true;
      if (notify) {
        try {
          const response = await fetch(
            `/api/clinic/appointments/${createdId}/confirmation`,
            { method: 'POST', signal: AbortSignal.timeout(12000) }
          );
          const result = await response.json().catch(() => ({}));
          if (
            !response.ok ||
            result.deliveries?.whatsapp?.error ||
            result.deliveries?.email?.error
          )
            toast.warning(
              'Marcação criada. Confirmação pendente; consulte a agenda para verificar o envio.'
            );
        } catch {
          toast.warning(
            'Marcação criada. Não foi possível confirmar o envio da mensagem.'
          );
        }
      }
      toast.success('Marcação criada. Pode continuar a conversa.');
      onCreated();
      onClose();
    } catch (error) {
      if (createdId && !committed) {
        const result = await db
          .from('clinic_appointments')
          .delete()
          .eq('id', createdId);
        if (result.error) {
          toast.error(
            'A marcação foi criada, mas o benefício não foi aplicado. Verifique na agenda antes de tentar novamente.'
          );
          onCreated();
          onClose();
          return;
        }
      }
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a marcação.'
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const selectClass =
    'border-border bg-background h-10 w-full min-w-0 rounded-lg border px-3 text-sm';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>
            Agendar para {contact.name || contact.phone}
          </DialogTitle>
          <DialogDescription>
            {benefit
              ? `Usar ${benefit.label}. O benefício será reservado para esta sessão.`
              : 'Marcação avulsa, sem sair da conversa.'}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" />A carregar agenda…
          </p>
        ) : loadError ? (
          <p role="alert" className="text-destructive text-sm">
            {loadError}
          </p>
        ) : (
          <fieldset disabled={saving} className="space-y-4">
            <label className="block space-y-1 text-xs font-medium">
              Serviço
              <select
                aria-label="Serviço"
                className={selectClass}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                disabled={!!benefit?.serviceId}
              >
                <option value="">Selecionar serviço</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.duration_minutes} min
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-medium">
                Data
                <Input
                  aria-label="Data"
                  type="date"
                  min={accountDateInput(new Date(), zone)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Hora
                <Input
                  aria-label="Hora"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs font-medium">
              Profissional
              <select
                aria-label="Profissional"
                className={selectClass}
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
              >
                <option value="">Selecionar profissional</option>
                {professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name || item.email}
                  </option>
                ))}
              </select>
            </label>
            {rooms.length > 0 && (
              <label className="block space-y-1 text-xs font-medium">
                Sala
                <select
                  aria-label="Sala"
                  className={selectClass}
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">Sem sala definida</option>
                  {rooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1 text-xs font-medium">
              Nota interna
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferências ou contexto para a sessão"
              />
            </label>
            {service && (
              <p className="bg-muted rounded-lg p-3 text-sm">
                {service.duration_minutes} min ·{' '}
                {formatCurrency(
                  Number(service.price),
                  service.currency || defaultCurrency
                )}
                <span className="text-muted-foreground mt-1 block text-xs">
                  {zone}
                  {benefit
                    ? ' · Benefício reservado; não é consumido agora.'
                    : ' · Pagamento tratado no atendimento.'}
                </span>
              </p>
            )}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              Enviar pedido de confirmação ao cliente
            </label>
          </fieldset>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Voltar à conversa
          </Button>
          <Button
            disabled={
              loading ||
              !!loadError ||
              saving ||
              !service ||
              !professionalId ||
              !time
            }
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarPlus className="size-4" />
            )}
            {saving ? 'A agendar…' : 'Criar marcação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardList,
  CreditCard,
  Gift,
  HeartHandshake,
  History,
  Lock,
  Loader2,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  Save,
  Send,
  Settings2,
  StickyNote,
  Trash2,
  UserCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  availabilityConflictMessage,
  findAvailabilityConflicts,
  snapMinutesToGrid,
  type AgendaResource,
  type AvailabilityRequest,
} from '@/lib/clinic/agenda-availability';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ContactForm } from '@/components/contacts/contact-form';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import {
  appointmentContactLabel,
  buildAppointmentMessage,
  canMessageAppointment,
  type AppointmentMessageAction,
} from '@/lib/clinic/appointment-messages';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type {
  ClinicAppointment,
  ClinicAgendaEvent,
  ClinicAgendaEventAction,
  ClinicAgendaEntityType,
  ClinicAppointmentStatus,
  ClinicRoom,
  ClinicService,
  ClinicTimeBlock,
  Contact,
  FinanceAppointmentBenefit,
  FinanceClientPack,
  FinanceSale,
  FinanceVoucher,
} from '@/types';

type CalendarView = 'day' | 'week';
type ResourceMode = 'all' | 'professional' | 'room';

type TeamMember = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_professional?: boolean | null;
  professional_title?: string | null;
  professional_color?: string | null;
  working_hours?: Record<string, unknown> | null;
  online_booking_blocked?: boolean | null;
};

type AppointmentRow = Omit<
  ClinicAppointment,
  'contact' | 'service' | 'room' | 'professional'
> & {
  contact?: Contact | null;
  service?: ClinicService | null;
  room?: ClinicRoom | null;
  professional?: TeamMember | null;
  anamnesis?: {
    id: string;
    public_token: string;
    status: string;
    submitted_at?: string | null;
  } | null;
  benefits?: Array<
    FinanceAppointmentBenefit & {
      client_pack_balance?: {
        total_sessions: number;
        remaining_sessions: number;
      } | null;
      client_pack?:
        | (FinanceClientPack & {
            pack?: { name?: string | null } | null;
          })
        | null;
    }
  > | null;
  sales?: FinanceSale[] | null;
};

type TimeBlockRow = Omit<ClinicTimeBlock, 'professional'> & {
  room?: ClinicRoom | null;
  professional?: TeamMember | null;
};

type AppointmentDraft = {
  contactId: string;
  serviceId: string;
  professionalProfileId: string;
  roomId: string;
  date: string;
  time: string;
  status: ClinicAppointmentStatus;
  notes: string;
};

type AppointmentEditDraft = AppointmentDraft & {
  couponCode: string;
  treatmentNotes: string;
  arrivedAt: string | null;
  paidAt: string | null;
};

type AppointmentPackOption = FinanceClientPack & {
  balances?: Array<{
    id: string;
    service_id: string;
    remaining_sessions: number;
    service?: { name?: string | null } | null;
  }>;
};

type BenefitCodeLookup = {
  id: string;
  kind: 'voucher' | 'pack';
  voucher_type?: 'gift_card' | 'service';
  code: string;
  label: string;
  balance?: number;
  currency?: string;
  remaining_uses?: number;
  total_sessions?: number;
  remaining_sessions?: number;
  service_id?: string | null;
  expires_at?: string | null;
  requires_pin: boolean;
  lookup_mode?: 'rpc' | 'fallback';
};

type TimeBlockDraft = {
  professionalProfileId: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  isOnlineBlock: boolean;
};

type ScheduleChangeType =
  'rescheduled' | 'schedule_changed' | 'wrong_booking_moved';

type ScheduleChangeDraft = {
  appointmentId: string;
  date: string;
  time: string;
  type: ScheduleChangeType;
  reason: string;
  source: 'drag' | 'manual';
  requestClientConfirmation: boolean;
  confirmationMessage: string;
  benefitDisposition: 'keep' | 'release';
};

type BenefitStatusAction = 'no_show' | 'cancelled';
type BenefitDisposition = 'release' | 'consume';

const SCHEDULE_CHANGE_OPTIONS: Array<{
  value: ScheduleChangeType;
  label: string;
  description: string;
}> = [
  {
    value: 'rescheduled',
    label: 'Remarcação',
    description: 'Cliente ou equipe alterou a data/horário do atendimento.',
  },
  {
    value: 'schedule_changed',
    label: 'Alteração',
    description: 'Ajuste operacional sem caracterizar remarcação.',
  },
  {
    value: 'wrong_booking_moved',
    label: 'Agendamento errado',
    description: 'A marcação estava no local/horário errado e foi corrigida.',
  },
];

const CALENDAR_START_HOUR = 9;
const CALENDAR_END_HOUR = 22;
const HOUR_HEIGHT = 84;

const STATUS_LABEL: Record<ClinicAppointmentStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Falta',
};

function appointmentSourceLabel(source?: string | null) {
  return (
    {
      manual: 'Manual',
      online: 'Marcação online',
      inbox: 'Inbox',
      automation: 'Automação',
      referral: 'Indique & Ganhe',
      import: 'Importação',
    }[source ?? ''] ??
    source ??
    'Não informada'
  );
}

function confirmationStatusLabel(status?: string | null) {
  return (
    {
      not_required: 'Não solicitada',
      pending: 'A aguardar cliente',
      confirmed: 'Confirmada pelo cliente',
      declined: 'Recusada pelo cliente',
    }[status ?? ''] ?? 'Não solicitada'
  );
}

function benefitStatusLabel(status: FinanceAppointmentBenefit['status']) {
  return {
    reserved: 'reservado',
    consumed: 'consumido',
    released: 'devolvido',
  }[status];
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMinutes(date: Date, amount: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function rangeBounds(date: Date, view: CalendarView) {
  if (view === 'week') {
    const start = startOfWeek(date);
    const end = addDays(start, 7);
    return { start, end };
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return { start, end: addDays(start, 1) };
}

function appointmentDate(date: string, time: string) {
  return new Date(`${date}T${time || '09:00'}:00`);
}

function appointmentRange(appointment: AppointmentRow) {
  const start = new Date(appointment.scheduled_start);
  const end = new Date(appointment.scheduled_end);
  return `${timeInputValue(start)}-${timeInputValue(end)}`;
}

function formatAppointmentDateTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildScheduleChangeConfirmationMessage({
  appointment,
  newStart,
  businessName,
}: {
  appointment: AppointmentRow;
  newStart: Date;
  businessName: string;
}) {
  const contactName = appointment.contact?.name?.trim();
  const service = appointment.service?.name ?? 'seu atendimento';
  const oldWhen = formatAppointmentDateTime(appointment.scheduled_start);
  const newWhen = formatAppointmentDateTime(newStart);
  const greeting = contactName ? `Olá, ${contactName}.` : 'Olá.';
  const brand = businessName.trim() || 'nossa clínica';

  return [
    greeting,
    `O seu agendamento de ${service} foi alterado de ${oldWhen} para ${newWhen}.`,
    'Responda CONFIRMAR para confirmar esta alteração ou REAGENDAR para pedir outro horário.',
    '',
    brand,
  ].join('\n');
}

function formatRangeTitle(date: Date, view: CalendarView) {
  if (view === 'week') {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
    })} - ${end.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`;
  }
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function defaultAppointmentDraft(profileId?: string | null): AppointmentDraft {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (now.getMinutes() === 0) now.setHours(now.getHours() + 1);

  return {
    contactId: '',
    serviceId: '',
    professionalProfileId: profileId ?? '',
    roomId: '',
    date: dateInputValue(now),
    time: timeInputValue(now),
    status: 'scheduled',
    notes: '',
  };
}

function defaultTimeBlockDraft(
  selectedDate: Date,
  professionalId?: string,
  roomId?: string
): TimeBlockDraft {
  return {
    professionalProfileId:
      professionalId === 'all' ? '' : (professionalId ?? ''),
    roomId: roomId === 'all' ? '' : (roomId ?? ''),
    date: dateInputValue(selectedDate),
    startTime: '09:00',
    endTime: '10:00',
    reason: '',
    isOnlineBlock: true,
  };
}

function timeBlockDraftFromBlock(block: TimeBlockRow): TimeBlockDraft {
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  return {
    professionalProfileId: block.professional_profile_id ?? '',
    roomId: block.room_id ?? '',
    date: dateInputValue(start),
    startTime: timeInputValue(start),
    endTime: timeInputValue(end),
    reason: block.reason ?? '',
    isOnlineBlock: block.is_online_block,
  };
}

function editDraftFromAppointment(
  appointment: AppointmentRow
): AppointmentEditDraft {
  const start = new Date(appointment.scheduled_start);
  return {
    contactId: appointment.contact_id ?? '',
    serviceId: appointment.service_id ?? '',
    professionalProfileId: appointment.professional_profile_id ?? '',
    roomId: appointment.room_id ?? '',
    date: dateInputValue(start),
    time: timeInputValue(start),
    status: appointment.status,
    notes: appointment.notes ?? '',
    couponCode: appointment.coupon_code ?? '',
    treatmentNotes: appointment.treatment_notes ?? '',
    arrivedAt: appointment.arrived_at ?? null,
    paidAt: appointment.paid_at ?? null,
  };
}

function isMissingAgendaSchema(error: { code?: string; message?: string }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.includes('clinic_services') ||
    error.message?.includes('clinic_appointments') ||
    error.message?.includes('clinic_rooms') ||
    error.message?.includes('clinic_time_blocks') ||
    error.message?.includes('clinic_agenda_events') ||
    error.message?.includes('schedule_change_count') ||
    error.message?.includes('client_reference') ||
    error.message?.includes('is_professional') ||
    error.message?.includes('working_hours') ||
    error.message?.includes('arrived_at') ||
    error.message?.includes('paid_at') ||
    error.message?.includes('confirmation_status')
  );
}

function calendarTop(iso: string) {
  const date = new Date(iso);
  const minutes =
    (date.getHours() - CALENDAR_START_HOUR) * 60 + date.getMinutes();
  return Math.max(0, (minutes / 60) * HOUR_HEIGHT);
}

function calendarHeight(appointment: AppointmentRow) {
  return calendarRangeHeight(
    appointment.scheduled_start,
    appointment.scheduled_end
  );
}

function calendarRangeHeight(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const minutes = Math.max(15, Math.round((end - start) / 60_000));
  return Math.max(38, (minutes / 60) * HOUR_HEIGHT);
}

function layoutAppointments(appointments: AppointmentRow[]) {
  const sorted = [...appointments].sort(
    (left, right) =>
      new Date(left.scheduled_start).getTime() -
      new Date(right.scheduled_start).getTime()
  );
  const result = new Map<string, { column: number; columns: number }>();
  let cluster: AppointmentRow[] = [];
  let clusterEnd = 0;

  function flushCluster() {
    if (!cluster.length) return;
    const columnEnds: number[] = [];
    const assignments = new Map<string, number>();
    for (const appointment of cluster) {
      const startAt = new Date(appointment.scheduled_start).getTime();
      const endAt = new Date(appointment.scheduled_end).getTime();
      let column = columnEnds.findIndex((value) => value <= startAt);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = endAt;
      assignments.set(appointment.id, column);
    }
    const columns = Math.max(1, columnEnds.length);
    for (const appointment of cluster) {
      result.set(appointment.id, {
        column: assignments.get(appointment.id) ?? 0,
        columns,
      });
    }
    cluster = [];
    clusterEnd = 0;
  }

  for (const appointment of sorted) {
    const startAt = new Date(appointment.scheduled_start).getTime();
    const endAt = new Date(appointment.scheduled_end).getTime();
    if (cluster.length && startAt >= clusterEnd) flushCluster();
    cluster.push(appointment);
    clusterEnd = Math.max(clusterEnd, endAt);
  }
  flushCluster();
  return result;
}

function professionalName(member: TeamMember | null | undefined) {
  return (
    member?.full_name ||
    member?.professional_title ||
    member?.email ||
    'Sem profissional'
  );
}

export function AgendaPage({
  initialContactId = null,
  initialAppointmentId = null,
  initialDate = null,
  initialReferralId = null,
  initialCreate = false,
}: {
  initialContactId?: string | null;
  initialAppointmentId?: string | null;
  initialDate?: string | null;
  initialReferralId?: string | null;
  initialCreate?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { accountId, account, user, profile, defaultCurrency, profileLoading } =
    useAuth();
  const canOperate = useCan('send-messages');

  const [view, setView] = useState<CalendarView>('day');
  const [resourceMode, setResourceMode] = useState<ResourceMode>('all');
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()
  );
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('all');
  const [selectedRoomId, setSelectedRoomId] = useState('all');
  const [services, setServices] = useState<ClinicService[]>([]);
  const [rooms, setRooms] = useState<ClinicRoom[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [appointmentReferralId, setAppointmentReferralId] = useState<
    string | null
  >(initialReferralId);
  const [appointmentDraft, setAppointmentDraft] = useState<AppointmentDraft>(
    () => defaultAppointmentDraft(profile?.id)
  );
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [quickContactOpen, setQuickContactOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<AppointmentRow | null>(null);
  const [editDraft, setEditDraft] = useState<AppointmentEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockEvents, setBlockEvents] = useState<ClinicAgendaEvent[]>([]);
  const [blockDraft, setBlockDraft] = useState<TimeBlockDraft>(() =>
    defaultTimeBlockDraft(new Date())
  );
  const [savingBlock, setSavingBlock] = useState(false);
  const [appointmentEvents, setAppointmentEvents] = useState<
    ClinicAgendaEvent[]
  >([]);
  const [appointmentBenefit, setAppointmentBenefit] =
    useState<FinanceAppointmentBenefit | null>(null);
  const [benefitType, setBenefitType] = useState<'direct' | 'voucher' | 'pack'>(
    'direct'
  );
  const [benefitSourceId, setBenefitSourceId] = useState('');
  const [benefitVoucherCode, setBenefitVoucherCode] = useState('');
  const [benefitVoucherPin, setBenefitVoucherPin] = useState('');
  const [benefitCodeLookup, setBenefitCodeLookup] =
    useState<BenefitCodeLookup | null>(null);
  const [lookingUpBenefit, setLookingUpBenefit] = useState(false);
  const [paymentChoiceOpen, setPaymentChoiceOpen] = useState(false);
  const [benefitDecisionOpen, setBenefitDecisionOpen] = useState(false);
  const [pendingBenefitAction, setPendingBenefitAction] =
    useState<BenefitStatusAction | null>(null);
  const [benefitDisposition, setBenefitDisposition] =
    useState<BenefitDisposition>('release');
  const [newBenefitType, setNewBenefitType] = useState<
    'direct' | 'voucher' | 'pack'
  >('direct');
  const [newBenefitSourceId, setNewBenefitSourceId] = useState('');
  const [newBenefitVoucherCode, setNewBenefitVoucherCode] = useState('');
  const [newBenefitVoucherPin, setNewBenefitVoucherPin] = useState('');
  const [newBenefitCodeLookup, setNewBenefitCodeLookup] =
    useState<BenefitCodeLookup | null>(null);
  const [, setAvailableVouchers] = useState<FinanceVoucher[]>([]);
  const [availablePacks, setAvailablePacks] = useState<AppointmentPackOption[]>(
    []
  );
  const [loadingBenefits, setLoadingBenefits] = useState(false);
  const [scheduleChangeOpen, setScheduleChangeOpen] = useState(false);
  const [scheduleChangeDraft, setScheduleChangeDraft] =
    useState<ScheduleChangeDraft | null>(null);
  const [savingScheduleChange, setSavingScheduleChange] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageAction, setMessageAction] =
    useState<AppointmentMessageAction>('confirmation');
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [initialAppointmentConsumed, setInitialAppointmentConsumed] =
    useState(false);
  const [deepLinkedAppointmentConsumed, setDeepLinkedAppointmentConsumed] =
    useState(false);
  const [initialCreateConsumed, setInitialCreateConsumed] = useState(false);

  const { start, end } = useMemo(
    () => rangeBounds(selectedDate, view),
    [selectedDate, view]
  );
  const activeServices = services.filter((service) => service.is_active);
  const activeRooms = rooms.filter((room) => room.is_active);
  const professionals = team.filter((member) => member.is_professional);
  const visibleProfessionals = professionals.length > 0 ? professionals : team;
  const selectedService =
    services.find((service) => service.id === appointmentDraft.serviceId) ??
    null;
  const selectedEditService =
    editDraft == null
      ? null
      : (services.find((service) => service.id === editDraft.serviceId) ??
        null);
  const scheduleChangeAppointment = scheduleChangeDraft
    ? (appointments.find(
        (item) => item.id === scheduleChangeDraft.appointmentId
      ) ?? null)
    : null;
  const scheduleChangeBenefit =
    scheduleChangeAppointment?.benefits?.find(
      (item) => item.status === 'reserved'
    ) ??
    (selectedAppointment?.id === scheduleChangeAppointment?.id
      ? appointmentBenefit
      : null);
  const editBenefitContactId = editDraft?.contactId ?? '';
  const editBenefitServiceId = editDraft?.serviceId ?? '';

  const openAppointmentDialog = useCallback(
    (contactId?: string, referralId?: string | null, requestedStart?: Date) => {
      const firstService = activeServices[0];
      const firstProfessional = visibleProfessionals[0];
      const firstRoom = activeRooms[0];
      const startAt = requestedStart ?? selectedDate;
      setAppointmentDraft({
        ...defaultAppointmentDraft(profile?.id),
        contactId: contactId ?? '',
        date: dateInputValue(startAt),
        time: requestedStart ? timeInputValue(requestedStart) : '09:00',
        serviceId: firstService?.id ?? '',
        professionalProfileId: profile?.id ?? firstProfessional?.id ?? '',
        roomId: firstRoom?.id ?? '',
      });
      setNewBenefitType('direct');
      setNewBenefitSourceId('');
      setNewBenefitVoucherCode('');
      setNewBenefitVoucherPin('');
      setNewBenefitCodeLookup(null);
      setAppointmentReferralId(referralId ?? null);
      setAppointmentOpen(true);
    },
    [
      activeRooms,
      activeServices,
      profile?.id,
      selectedDate,
      visibleProfessionals,
    ]
  );

  const filteredAppointments = appointments.filter((appointment) => {
    if (
      resourceMode === 'professional' &&
      selectedProfessionalId !== 'all' &&
      appointment.professional_profile_id !== selectedProfessionalId
    ) {
      return false;
    }
    if (
      resourceMode === 'room' &&
      selectedRoomId !== 'all' &&
      appointment.room_id !== selectedRoomId
    ) {
      return false;
    }
    return true;
  });

  const filteredTimeBlocks = timeBlocks.filter((block) => {
    if (
      resourceMode === 'professional' &&
      selectedProfessionalId !== 'all' &&
      block.professional_profile_id &&
      block.professional_profile_id !== selectedProfessionalId
    ) {
      return false;
    }
    if (
      resourceMode === 'room' &&
      selectedRoomId !== 'all' &&
      block.room_id &&
      block.room_id !== selectedRoomId
    ) {
      return false;
    }
    return true;
  });

  const totalRevenue = filteredAppointments
    .filter((appointment) => appointment.status !== 'cancelled')
    .reduce((sum, appointment) => sum + Number(appointment.price ?? 0), 0);
  const periodBenefits = filteredAppointments.flatMap(
    (appointment) =>
      appointment.benefits?.filter((item) => item.status !== 'released') ?? []
  );
  const voucherReserved = periodBenefits.filter(
    (item) => item.benefit_type === 'voucher' && item.status === 'reserved'
  ).length;
  const voucherUsed = periodBenefits.filter(
    (item) => item.benefit_type === 'voucher' && item.status === 'consumed'
  ).length;
  const packReserved = periodBenefits.filter(
    (item) => item.benefit_type === 'pack' && item.status === 'reserved'
  ).length;
  const packUsed = periodBenefits.filter(
    (item) => item.benefit_type === 'pack' && item.status === 'consumed'
  ).length;
  const paidAppointments = filteredAppointments.filter(
    (appointment) => appointment.paid_at
  ).length;
  const partialPayments = filteredAppointments.filter((appointment) =>
    appointment.sales?.some((sale) => sale.status === 'partially_paid')
  ).length;
  const referralAppointments = filteredAppointments.filter(
    (appointment) => appointment.referral_id
  ).length;

  const ensureAvailability = useCallback(
    async (request: AvailabilityRequest) => {
      if (!accountId) return false;

      const [appointmentsRes, blocksRes] = await Promise.all([
        supabase
          .from('clinic_appointments')
          .select(
            'id, scheduled_start, scheduled_end, professional_profile_id, room_id, status'
          )
          .eq('account_id', accountId)
          .lt('scheduled_start', request.endsAt.toISOString())
          .gt('scheduled_end', request.startsAt.toISOString()),
        supabase
          .from('clinic_time_blocks')
          .select('id, starts_at, ends_at, professional_profile_id, room_id')
          .eq('account_id', accountId)
          .lt('starts_at', request.endsAt.toISOString())
          .gt('ends_at', request.startsAt.toISOString()),
      ]);

      if (appointmentsRes.error || blocksRes.error) {
        toast.error(
          `Não foi possível validar a disponibilidade: ${appointmentsRes.error?.message ?? blocksRes.error?.message}`
        );
        return false;
      }

      const resources: AgendaResource[] = [
        ...((appointmentsRes.data ?? []).map((item) => ({
          id: item.id,
          kind: 'appointment' as const,
          startsAt: item.scheduled_start,
          endsAt: item.scheduled_end,
          professionalId: item.professional_profile_id,
          roomId: item.room_id,
          status: item.status,
        })) as AgendaResource[]),
        ...((blocksRes.data ?? []).map((item) => ({
          id: item.id,
          kind: 'time_block' as const,
          startsAt: item.starts_at,
          endsAt: item.ends_at,
          professionalId: item.professional_profile_id,
          roomId: item.room_id,
        })) as AgendaResource[]),
      ];
      const conflicts = findAvailabilityConflicts(resources, request);
      const message = availabilityConflictMessage(conflicts);
      if (message) {
        toast.error(message);
        return false;
      }
      return true;
    },
    [accountId, supabase]
  );

  const loadAgenda = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setSchemaMissing(false);

    const [
      servicesRes,
      roomsRes,
      appointmentsRes,
      blocksRes,
      contactsRes,
      teamRes,
    ] = await Promise.all([
      supabase
        .from('clinic_services')
        .select('*')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('clinic_rooms')
        .select('*')
        .eq('account_id', accountId)
        .order('is_active', { ascending: false })
        .order('name'),
      supabase
        .from('clinic_appointments')
        .select(
          '*, contact:contacts(*), service:clinic_services(*), room:clinic_rooms(*), professional:profiles!clinic_appointments_professional_profile_id_fkey(id, user_id, full_name, email, is_professional, professional_title, professional_color), anamnesis:clinic_anamnesis_forms!clinic_appointments_anamnesis_form_id_fkey(id, public_token, status, submitted_at), benefits:finance_appointment_benefits(*, voucher:finance_vouchers(*), client_pack:finance_client_packs(*, pack:finance_pack_catalog(name)), client_pack_balance:finance_client_pack_balances(total_sessions, remaining_sessions)), sales:finance_sales(*, payments:finance_payments(*))'
        )
        .eq('account_id', accountId)
        .lt('scheduled_start', end.toISOString())
        .gt('scheduled_end', start.toISOString())
        .order('scheduled_start'),
      supabase
        .from('clinic_time_blocks')
        .select(
          '*, room:clinic_rooms(*), professional:profiles!clinic_time_blocks_professional_profile_id_fkey(id, user_id, full_name, email, is_professional, professional_title, professional_color)'
        )
        .eq('account_id', accountId)
        .lt('starts_at', end.toISOString())
        .gt('ends_at', start.toISOString())
        .order('starts_at'),
      supabase
        .from('contacts')
        .select(
          'id, user_id, account_id, phone, phone_normalized, client_reference, name, email, company, avatar_url, created_at, updated_at'
        )
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .limit(1000),
      supabase
        .from('profiles')
        .select(
          'id, user_id, full_name, email, is_professional, professional_title, professional_color, working_hours, online_booking_blocked'
        )
        .eq('account_id', accountId)
        .order('full_name'),
    ]);

    const firstError =
      servicesRes.error ??
      roomsRes.error ??
      appointmentsRes.error ??
      blocksRes.error ??
      contactsRes.error ??
      teamRes.error ??
      null;

    if (firstError) {
      if (isMissingAgendaSchema(firstError)) setSchemaMissing(true);
      else toast.error(`Falha ao carregar agenda: ${firstError.message}`);
      setLoading(false);
      return;
    }

    setServices((servicesRes.data ?? []) as ClinicService[]);
    setRooms((roomsRes.data ?? []) as ClinicRoom[]);
    setAppointments((appointmentsRes.data ?? []) as AppointmentRow[]);
    setTimeBlocks((blocksRes.data ?? []) as TimeBlockRow[]);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setTeam((teamRes.data ?? []) as TeamMember[]);
    setLastUpdatedAt(new Date());
    setLoading(false);
  }, [accountId, end, start, supabase]);

  useEffect(() => {
    if (profileLoading) return;
    const timer = window.setTimeout(() => {
      void loadAgenda();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAgenda, profileLoading]);

  useEffect(() => {
    if (!accountId) return;
    let refreshTimer: number | null = null;
    const refresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void loadAgenda(), 250);
    };
    const channel = supabase
      .channel(`agenda:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clinic_appointments',
          filter: `account_id=eq.${accountId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clinic_time_blocks',
          filter: `account_id=eq.${accountId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [accountId, loadAgenda, supabase]);

  useEffect(() => {
    if (!initialContactId || loading || initialAppointmentConsumed) return;
    let cancelled = false;

    async function openForContact() {
      let contact = contacts.find((item) => item.id === initialContactId);
      if (!contact && accountId) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('account_id', accountId)
          .eq('id', initialContactId)
          .maybeSingle();
        if (error || !data) {
          toast.error('O cliente selecionado não foi encontrado.');
          if (!cancelled) setInitialAppointmentConsumed(true);
          return;
        }
        contact = data as Contact;
        if (!cancelled) {
          setContacts((current) =>
            current.some((item) => item.id === contact?.id)
              ? current
              : [contact as Contact, ...current]
          );
        }
      }
      if (cancelled || !contact) return;
      openAppointmentDialog(contact.id, initialReferralId);
      setInitialAppointmentConsumed(true);
    }

    void openForContact();
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    contacts,
    initialAppointmentConsumed,
    initialContactId,
    initialReferralId,
    loading,
    openAppointmentDialog,
    supabase,
  ]);

  useEffect(() => {
    if (
      !initialCreate ||
      initialContactId ||
      loading ||
      initialCreateConsumed
    ) {
      return;
    }
    openAppointmentDialog();
    setInitialCreateConsumed(true);
  }, [
    initialContactId,
    initialCreate,
    initialCreateConsumed,
    loading,
    openAppointmentDialog,
  ]);

  useEffect(() => {
    if (!initialAppointmentId || loading || deepLinkedAppointmentConsumed)
      return;
    const appointment = appointments.find(
      (item) => item.id === initialAppointmentId
    );
    if (appointment) {
      void openAppointmentSheet(appointment);
      setDeepLinkedAppointmentConsumed(true);
      return;
    }

    if (!accountId) return;
    setDeepLinkedAppointmentConsumed(true);
    void supabase
      .from('clinic_appointments')
      .select(
        '*, contact:contacts(*), service:clinic_services(*), room:clinic_rooms(*), professional:profiles!clinic_appointments_professional_profile_id_fkey(id, user_id, full_name, email, is_professional, professional_title, professional_color), anamnesis:clinic_anamnesis_forms!clinic_appointments_anamnesis_form_id_fkey(id, public_token, status, submitted_at), benefits:finance_appointment_benefits(*, voucher:finance_vouchers(*), client_pack:finance_client_packs(*, pack:finance_pack_catalog(name)), client_pack_balance:finance_client_pack_balances(total_sessions, remaining_sessions)), sales:finance_sales(*, payments:finance_payments(*))'
      )
      .eq('account_id', accountId)
      .eq('id', initialAppointmentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast.error('A marcação solicitada não foi encontrada.');
          return;
        }
        const found = data as AppointmentRow;
        setSelectedDate(new Date(found.scheduled_start));
        void openAppointmentSheet(found);
      });
    // The consumed guard makes this a one-shot deep-link action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appointments,
    accountId,
    deepLinkedAppointmentConsumed,
    initialAppointmentId,
    loading,
    supabase,
  ]);

  async function recordAgendaEvent(input: {
    entityType: ClinicAgendaEntityType;
    entityId: string;
    action: ClinicAgendaEventAction;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    oldStart?: string | null;
    oldEnd?: string | null;
    newStart?: string | null;
    newEnd?: string | null;
  }) {
    if (!accountId) return;
    const { error } = await supabase.from('clinic_agenda_events').insert({
      account_id: accountId,
      user_id: user?.id ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      old_starts_at: input.oldStart ?? null,
      old_ends_at: input.oldEnd ?? null,
      new_starts_at: input.newStart ?? null,
      new_ends_at: input.newEnd ?? null,
    });
    if (error && !isMissingAgendaSchema(error)) {
      console.warn('[agenda] failed to record event:', error.message);
    }
  }

  async function loadAgendaEvents(
    entityType: ClinicAgendaEntityType,
    entityId: string
  ) {
    if (!accountId) return [];
    const { data, error } = await supabase
      .from('clinic_agenda_events')
      .select('*')
      .eq('account_id', accountId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      if (!isMissingAgendaSchema(error)) {
        toast.error(`Falha ao carregar histórico: ${error.message}`);
      }
      return [];
    }
    return (data ?? []) as ClinicAgendaEvent[];
  }

  async function handleCreateAppointment() {
    if (!accountId || !user?.id) return;
    if (!appointmentDraft.contactId) {
      toast.error('Selecione o cliente.');
      return;
    }
    if (!appointmentDraft.serviceId || !selectedService) {
      toast.error('Selecione o procedimento.');
      return;
    }
    if (
      (newBenefitType === 'voucher' &&
        (!newBenefitVoucherCode.trim() || !newBenefitVoucherPin.trim())) ||
      (newBenefitType === 'pack' &&
        (!newBenefitSourceId ||
          (Boolean(newBenefitCodeLookup) && !newBenefitVoucherPin.trim())))
    ) {
      toast.error('Informe o código e PIN do voucher ou selecione o pack.');
      return;
    }

    const startAt = appointmentDate(
      appointmentDraft.date,
      appointmentDraft.time
    );
    const endAt = addMinutes(startAt, selectedService.duration_minutes);

    if (
      !(await ensureAvailability({
        startsAt: startAt,
        endsAt: endAt,
        professionalId: appointmentDraft.professionalProfileId || null,
        roomId: appointmentDraft.roomId || null,
      }))
    ) {
      return;
    }

    setSavingAppointment(true);
    const { data, error } = await supabase
      .from('clinic_appointments')
      .insert({
        account_id: accountId,
        user_id: user.id,
        contact_id: appointmentDraft.contactId,
        service_id: appointmentDraft.serviceId,
        professional_profile_id: appointmentDraft.professionalProfileId || null,
        room_id: appointmentDraft.roomId || null,
        scheduled_start: startAt.toISOString(),
        scheduled_end: endAt.toISOString(),
        status: appointmentDraft.status,
        source: appointmentReferralId ? 'referral' : 'manual',
        referral_id: appointmentReferralId,
        price: Number(selectedService.price ?? 0),
        currency: selectedService.currency || defaultCurrency,
        notes: appointmentDraft.notes.trim() || null,
        original_scheduled_start: startAt.toISOString(),
        original_scheduled_end: endAt.toISOString(),
      })
      .select(
        'id, price, original_price, referral_id, referral_discount_amount'
      )
      .single();
    if (error) {
      setSavingAppointment(false);
      toast.error(`Falha ao criar agendamento: ${error.message}`);
      return;
    }

    if (data?.id && newBenefitType !== 'direct') {
      const { error: benefitError } =
        newBenefitCodeLookup &&
        (newBenefitCodeLookup.kind === 'pack' ||
          newBenefitCodeLookup.lookup_mode !== 'fallback')
          ? await supabase.rpc('reserve_appointment_benefit_code', {
              p_appointment_id: data.id,
              p_code: newBenefitVoucherCode.trim(),
              p_pin: newBenefitVoucherPin.trim(),
            })
          : newBenefitType === 'voucher'
            ? await supabase.rpc('reserve_appointment_voucher', {
                p_appointment_id: data.id,
                p_code: newBenefitVoucherCode.trim(),
                p_pin: newBenefitVoucherPin.trim(),
              })
            : await supabase.rpc('set_appointment_benefit', {
                p_appointment_id: data.id,
                p_benefit_type: 'pack',
                p_source_id: newBenefitSourceId,
              });
      if (benefitError) {
        await supabase
          .from('clinic_appointments')
          .delete()
          .eq('id', data.id)
          .eq('account_id', accountId);
        setSavingAppointment(false);
        toast.error(
          `O benefício não pôde ser reservado e o agendamento foi revertido: ${benefitError.message}`
        );
        return;
      }
    }
    let confirmationWarning: string | null = null;
    let confirmationSkipped = false;
    if (data?.id) {
      const confirmationResponse = await fetch(
        `/api/clinic/appointments/${data.id}/confirmation`,
        { method: 'POST' }
      );
      if (!confirmationResponse.ok) {
        const confirmationPayload = await confirmationResponse
          .json()
          .catch(() => ({}));
        confirmationWarning =
          confirmationPayload.error || 'Não foi possível enviar o WhatsApp.';
      } else {
        const confirmationPayload = await confirmationResponse.json();
        confirmationSkipped = Boolean(confirmationPayload.skipped);
      }
    }
    setSavingAppointment(false);

    if (confirmationWarning) {
      toast.warning(
        `Agendamento criado, mas a confirmação ficou pendente: ${confirmationWarning}`
      );
    } else if (confirmationSkipped) {
      toast.success('Agendamento criado. O envio automático está desativado.');
    } else {
      toast.success(
        Number(data?.referral_discount_amount ?? 0) > 0
          ? `Agendamento criado com ${formatCurrency(Number(data?.referral_discount_amount), selectedService.currency || defaultCurrency)} de desconto da indicação e confirmação enviada.`
          : 'Agendamento criado e confirmação enviada pelo WhatsApp.'
      );
    }
    if (data?.id) {
      void recordAgendaEvent({
        entityType: 'appointment',
        entityId: data.id,
        action: 'created',
        newStart: startAt.toISOString(),
        newEnd: endAt.toISOString(),
        metadata: {
          source: data?.referral_id ? 'referral' : 'manual',
          referral_id: data?.referral_id ?? appointmentReferralId,
          referral_discount_amount: data?.referral_discount_amount ?? 0,
        },
      });
    }
    setAppointmentOpen(false);
    setSelectedDate(startAt);
    void loadAgenda();
  }

  function openTimeBlockDialog() {
    setEditingBlockId(null);
    setBlockEvents([]);
    setBlockDraft(
      defaultTimeBlockDraft(
        selectedDate,
        resourceMode === 'professional' ? selectedProfessionalId : '',
        resourceMode === 'room' ? selectedRoomId : ''
      )
    );
    setBlockOpen(true);
  }

  async function openTimeBlockSheet(block: TimeBlockRow) {
    setEditingBlockId(block.id);
    setBlockDraft(timeBlockDraftFromBlock(block));
    setBlockEvents(await loadAgendaEvents('time_block', block.id));
    setBlockOpen(true);
  }

  async function handleSaveTimeBlock() {
    if (!accountId || !user?.id) return;
    const startsAt = appointmentDate(blockDraft.date, blockDraft.startTime);
    const endsAt = appointmentDate(blockDraft.date, blockDraft.endTime);

    if (endsAt <= startsAt) {
      toast.error('O fim do bloqueio deve ser depois do início.');
      return;
    }

    if (
      !(await ensureAvailability({
        startsAt,
        endsAt,
        professionalId: blockDraft.professionalProfileId || null,
        roomId: blockDraft.roomId || null,
        excludeBlockId: editingBlockId,
        globalResource: !blockDraft.professionalProfileId && !blockDraft.roomId,
      }))
    ) {
      return;
    }

    const payload = {
      professional_profile_id: blockDraft.professionalProfileId || null,
      room_id: blockDraft.roomId || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: blockDraft.reason.trim() || null,
      is_online_block: blockDraft.isOnlineBlock,
    };
    const previousBlock = editingBlockId
      ? timeBlocks.find((block) => block.id === editingBlockId)
      : null;

    setSavingBlock(true);
    const result = editingBlockId
      ? await supabase
          .from('clinic_time_blocks')
          .update(payload)
          .eq('id', editingBlockId)
          .eq('account_id', accountId)
          .select('id')
          .single()
      : await supabase
          .from('clinic_time_blocks')
          .insert({
            account_id: accountId,
            user_id: user.id,
            ...payload,
          })
          .select('id')
          .single();
    setSavingBlock(false);

    if (result.error || !result.data) {
      toast.error(
        `Falha ao ${editingBlockId ? 'editar' : 'bloquear'} horário: ${
          result.error?.message ?? 'sem retorno'
        }`
      );
      return;
    }

    void recordAgendaEvent({
      entityType: 'time_block',
      entityId: result.data.id,
      action: editingBlockId ? 'updated' : 'created',
      reason: blockDraft.reason.trim() || null,
      oldStart: previousBlock?.starts_at ?? null,
      oldEnd: previousBlock?.ends_at ?? null,
      newStart: startsAt.toISOString(),
      newEnd: endsAt.toISOString(),
      metadata: {
        professional_profile_id: payload.professional_profile_id,
        room_id: payload.room_id,
        online_block: payload.is_online_block,
      },
    });

    toast.success(
      editingBlockId ? 'Bloqueio atualizado.' : 'Horário bloqueado.'
    );
    setBlockOpen(false);
    setEditingBlockId(null);
    setBlockEvents([]);
    void loadAgenda();
  }

  async function handleDeleteTimeBlock() {
    if (!accountId || !editingBlockId) return;
    const block = timeBlocks.find((item) => item.id === editingBlockId);
    setSavingBlock(true);
    const { error } = await supabase
      .from('clinic_time_blocks')
      .delete()
      .eq('id', editingBlockId)
      .eq('account_id', accountId);
    setSavingBlock(false);

    if (error) {
      toast.error(`Falha ao apagar bloqueio: ${error.message}`);
      return;
    }

    await recordAgendaEvent({
      entityType: 'time_block',
      entityId: editingBlockId,
      action: 'deleted',
      reason: blockDraft.reason.trim() || block?.reason || null,
      oldStart: block?.starts_at ?? null,
      oldEnd: block?.ends_at ?? null,
      metadata: {
        professional_profile_id: block?.professional_profile_id ?? null,
        room_id: block?.room_id ?? null,
      },
    });

    toast.success('Bloqueio apagado.');
    setBlockOpen(false);
    setEditingBlockId(null);
    setBlockEvents([]);
    void loadAgenda();
  }

  const loadAppointmentBenefits = useCallback(
    async (appointmentId: string, contactId: string, serviceId: string) => {
      if (!accountId || !contactId || !serviceId) {
        setAvailableVouchers([]);
        setAvailablePacks([]);
        setAppointmentBenefit(null);
        setBenefitType('direct');
        setBenefitSourceId('');
        return;
      }
      setLoadingBenefits(true);
      const [vouchersRes, packsRes, benefitRes] = await Promise.all([
        supabase
          .from('finance_vouchers')
          .select('*')
          .eq('account_id', accountId)
          .eq('owner_contact_id', contactId)
          .eq('status', 'active')
          .gt('current_balance', 0)
          .order('expires_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('finance_client_packs')
          .select(
            '*, pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(name))'
          )
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .eq('status', 'active')
          .order('expires_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('finance_appointment_benefits')
          .select('*, voucher:finance_vouchers(*)')
          .eq('appointment_id', appointmentId)
          .in('status', ['reserved', 'consumed'])
          .maybeSingle(),
      ]);

      const now = Date.now();
      setAvailableVouchers(
        vouchersRes.error
          ? []
          : ((vouchersRes.data as FinanceVoucher[] | null) ?? []).filter(
              (item) =>
                !item.expires_at || new Date(item.expires_at).getTime() > now
            )
      );
      setAvailablePacks(
        packsRes.error
          ? []
          : ((packsRes.data as AppointmentPackOption[] | null) ?? []).filter(
              (item) =>
                (!item.expires_at ||
                  new Date(item.expires_at).getTime() > now) &&
                (item.balances ?? []).some(
                  (balance) =>
                    balance.service_id === serviceId &&
                    Number(balance.remaining_sessions) > 0
                )
            )
      );
      const benefit = benefitRes.error
        ? null
        : ((benefitRes.data as FinanceAppointmentBenefit | null) ?? null);
      setAppointmentBenefit(benefit);
      setBenefitType(benefit?.benefit_type ?? 'direct');
      setBenefitSourceId(
        benefit?.benefit_type === 'voucher'
          ? (benefit.voucher_id ?? '')
          : benefit?.benefit_type === 'pack'
            ? (benefit.client_pack_id ?? '')
            : ''
      );
      setBenefitVoucherCode(benefit?.voucher?.code ?? '');
      setBenefitVoucherPin('');
      setBenefitCodeLookup(null);
      setLoadingBenefits(false);
    },
    [accountId, supabase]
  );

  async function lookupBenefitCode(rawCode?: string) {
    const code = (rawCode ?? editDraft?.couponCode ?? '').trim().toUpperCase();
    if (!code) {
      setBenefitCodeLookup(null);
      setBenefitType('direct');
      setBenefitSourceId('');
      setBenefitVoucherCode('');
      setBenefitVoucherPin('');
      return;
    }

    setLookingUpBenefit(true);
    const { result, error, schemaUnavailable } = await findBenefitByCode(code);
    setLookingUpBenefit(false);

    if (error) {
      toast.error(`Não foi possível pesquisar o código: ${error.message}`);
      return;
    }
    if (!result) {
      setBenefitCodeLookup(null);
      setBenefitType('direct');
      setBenefitSourceId('');
      toast.error(
        schemaUnavailable
          ? 'A pesquisa de benefícios ainda não está instalada no servidor. Aplique a migração 067.'
          : 'Código não encontrado ou benefício sem saldo, expirado ou inativo.'
      );
      return;
    }
    if (
      result.kind === 'voucher' &&
      result.voucher_type === 'service' &&
      result.service_id &&
      result.service_id !== editDraft?.serviceId
    ) {
      setBenefitCodeLookup(null);
      toast.error('Este voucher pertence a outra modalidade.');
      return;
    }

    setBenefitCodeLookup(result);
    setBenefitType(result.kind);
    setBenefitSourceId(result.id);
    setBenefitVoucherCode(result.code);
    setBenefitVoucherPin('');
    setEditDraft((current) =>
      current ? { ...current, couponCode: result.code } : current
    );
    toast.success(`${result.label} encontrado. Informe o PIN para validar.`);
  }

  async function lookupNewBenefitCode() {
    const code = newBenefitVoucherCode.trim().toUpperCase();
    if (!code) return;
    setLookingUpBenefit(true);
    const { result, error, schemaUnavailable } = await findBenefitByCode(code);
    setLookingUpBenefit(false);
    if (error || !result) {
      setNewBenefitCodeLookup(null);
      toast.error(
        error
          ? `Não foi possível pesquisar o código: ${error.message}`
          : schemaUnavailable
            ? 'A pesquisa de benefícios ainda não está instalada no servidor. Aplique a migração 067.'
            : 'Código não encontrado ou benefício sem saldo, expirado ou inativo.'
      );
      return;
    }
    if (
      result.kind === 'voucher' &&
      result.voucher_type === 'service' &&
      result.service_id !== appointmentDraft.serviceId
    ) {
      toast.error('Este voucher pertence a outra modalidade.');
      return;
    }
    setNewBenefitCodeLookup(result);
    setNewBenefitType(result.kind);
    setNewBenefitSourceId(result.id);
    setNewBenefitVoucherCode(result.code);
    setNewBenefitVoucherPin('');
    toast.success(`${result.label} encontrado. Informe o PIN.`);
  }

  async function findBenefitByCode(code: string): Promise<{
    result: BenefitCodeLookup | null;
    error: { message: string } | null;
    schemaUnavailable: boolean;
  }> {
    const rpcResult = await supabase.rpc('lookup_finance_benefit_code', {
      p_code: code,
    });
    if (!rpcResult.error) {
      return {
        result: rpcResult.data
          ? {
              ...(rpcResult.data as BenefitCodeLookup),
              lookup_mode: 'rpc',
            }
          : null,
        error: null,
        schemaUnavailable: false,
      };
    }
    const missingFunction =
      rpcResult.error.code === 'PGRST202' ||
      rpcResult.error.message.includes('lookup_finance_benefit_code');
    if (!missingFunction) {
      return { result: null, error: rpcResult.error, schemaUnavailable: false };
    }

    const voucherResult = await supabase
      .from('finance_vouchers')
      .select(
        'id, code, voucher_type, current_balance, currency, remaining_uses, service_id, expires_at, status'
      )
      .eq('account_id', accountId)
      .ilike('code', code)
      .eq('status', 'active')
      .maybeSingle();
    if (voucherResult.error) {
      return {
        result: null,
        error: voucherResult.error,
        schemaUnavailable: false,
      };
    }
    const voucher = voucherResult.data;
    if (
      voucher &&
      (!voucher.expires_at ||
        new Date(voucher.expires_at).getTime() > Date.now()) &&
      (Number(voucher.current_balance) > 0 ||
        Number(voucher.remaining_uses ?? 0) > 0)
    ) {
      return {
        result: {
          id: voucher.id,
          kind: 'voucher',
          voucher_type: voucher.voucher_type,
          code: voucher.code,
          label:
            voucher.voucher_type === 'service'
              ? 'Voucher de modalidade'
              : 'Cartão presente',
          balance: Number(voucher.current_balance),
          currency: voucher.currency,
          remaining_uses: voucher.remaining_uses ?? undefined,
          service_id: voucher.service_id,
          expires_at: voucher.expires_at,
          requires_pin: true,
          lookup_mode: 'fallback',
        },
        error: null,
        schemaUnavailable: false,
      };
    }

    const packResult = await supabase
      .from('finance_client_packs')
      .select(
        'id, code, expires_at, pack:finance_pack_catalog(name), balances:finance_client_pack_balances(total_sessions, remaining_sessions)'
      )
      .eq('account_id', accountId)
      .ilike('code', code)
      .eq('status', 'active')
      .maybeSingle();
    if (packResult.error) {
      const missingPackCode =
        packResult.error.code === '42703' ||
        packResult.error.code === 'PGRST204' ||
        /finance_client_packs.*code|code.*finance_client_packs/i.test(
          packResult.error.message
        );
      return {
        result: null,
        error: missingPackCode ? null : packResult.error,
        schemaUnavailable: missingPackCode,
      };
    }
    const pack = packResult.data as {
      id: string;
      code: string;
      expires_at: string | null;
      pack: { name: string } | null;
      balances: Array<{
        total_sessions: number;
        remaining_sessions: number;
      }>;
    } | null;
    const totalSessions = (pack?.balances ?? []).reduce(
      (total, balance) => total + Number(balance.total_sessions),
      0
    );
    const remainingSessions = (pack?.balances ?? []).reduce(
      (total, balance) => total + Number(balance.remaining_sessions),
      0
    );
    if (
      !pack ||
      remainingSessions <= 0 ||
      (pack.expires_at && new Date(pack.expires_at).getTime() <= Date.now())
    ) {
      return { result: null, error: null, schemaUnavailable: false };
    }
    return {
      result: {
        id: pack.id,
        kind: 'pack',
        code: pack.code,
        label: pack.pack?.name ?? 'Pack de sessões',
        total_sessions: totalSessions,
        remaining_sessions: remainingSessions,
        expires_at: pack.expires_at,
        requires_pin: true,
        lookup_mode: 'fallback',
      },
      error: null,
      schemaUnavailable: false,
    };
  }

  async function openAppointmentSheet(appointment: AppointmentRow) {
    setSelectedAppointment(appointment);
    setEditDraft(editDraftFromAppointment(appointment));
    setAppointmentEvents(await loadAgendaEvents('appointment', appointment.id));
  }

  useEffect(() => {
    if (!selectedAppointment || !editBenefitContactId || !editBenefitServiceId)
      return;
    void loadAppointmentBenefits(
      selectedAppointment.id,
      editBenefitContactId,
      editBenefitServiceId
    );
  }, [
    editBenefitContactId,
    editBenefitServiceId,
    loadAppointmentBenefits,
    selectedAppointment,
  ]);

  useEffect(() => {
    if (
      !appointmentOpen ||
      !accountId ||
      !appointmentDraft.contactId ||
      !appointmentDraft.serviceId
    )
      return;
    let cancelled = false;
    setLoadingBenefits(true);
    void Promise.all([
      supabase
        .from('finance_vouchers')
        .select('*')
        .eq('account_id', accountId)
        .eq('owner_contact_id', appointmentDraft.contactId)
        .eq('status', 'active')
        .gt('current_balance', 0),
      supabase
        .from('finance_client_packs')
        .select(
          '*, pack:finance_pack_catalog(*), balances:finance_client_pack_balances(*, service:clinic_services(name))'
        )
        .eq('account_id', accountId)
        .eq('contact_id', appointmentDraft.contactId)
        .eq('status', 'active'),
    ]).then(([vouchersRes, packsRes]) => {
      if (cancelled) return;
      const now = Date.now();
      setAvailableVouchers(
        vouchersRes.error
          ? []
          : ((vouchersRes.data as FinanceVoucher[] | null) ?? []).filter(
              (item) =>
                !item.expires_at || new Date(item.expires_at).getTime() > now
            )
      );
      setAvailablePacks(
        packsRes.error
          ? []
          : ((packsRes.data as AppointmentPackOption[] | null) ?? []).filter(
              (item) =>
                (!item.expires_at ||
                  new Date(item.expires_at).getTime() > now) &&
                (item.balances ?? []).some(
                  (balance) =>
                    balance.service_id === appointmentDraft.serviceId &&
                    Number(balance.remaining_sessions) > 0
                )
            )
      );
      setLoadingBenefits(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    appointmentDraft.contactId,
    appointmentDraft.serviceId,
    appointmentOpen,
    supabase,
  ]);

  function closeAppointmentSheet() {
    if (savingEdit) return;
    setSelectedAppointment(null);
    setEditDraft(null);
    setAppointmentEvents([]);
    setAppointmentBenefit(null);
    setAvailableVouchers([]);
    setAvailablePacks([]);
    setBenefitType('direct');
    setBenefitSourceId('');
    setBenefitVoucherCode('');
    setBenefitVoucherPin('');
    setBenefitDecisionOpen(false);
    setPendingBenefitAction(null);
    setBenefitDisposition('release');
  }

  function buildEditableAppointmentRow(): AppointmentRow | null {
    if (!selectedAppointment || !editDraft) return null;
    const contact =
      contacts.find((item) => item.id === editDraft.contactId) ??
      selectedAppointment.contact ??
      null;
    const service =
      services.find((item) => item.id === editDraft.serviceId) ??
      selectedAppointment.service ??
      null;
    const professional =
      team.find((item) => item.id === editDraft.professionalProfileId) ??
      selectedAppointment.professional ??
      null;
    const room =
      rooms.find((item) => item.id === editDraft.roomId) ??
      selectedAppointment.room ??
      null;
    const startAt = appointmentDate(editDraft.date, editDraft.time);
    const endAt = addMinutes(
      startAt,
      service?.duration_minutes ??
        Math.round(
          (new Date(selectedAppointment.scheduled_end).getTime() -
            new Date(selectedAppointment.scheduled_start).getTime()) /
            60_000
        )
    );

    return {
      ...selectedAppointment,
      contact_id: editDraft.contactId || null,
      service_id: editDraft.serviceId || null,
      professional_profile_id: editDraft.professionalProfileId || null,
      room_id: editDraft.roomId || null,
      scheduled_start: startAt.toISOString(),
      scheduled_end: endAt.toISOString(),
      status: editDraft.status,
      notes: editDraft.notes,
      coupon_code: editDraft.couponCode,
      treatment_notes: editDraft.treatmentNotes,
      arrived_at: editDraft.arrivedAt,
      paid_at: editDraft.paidAt,
      contact,
      service,
      professional,
      room,
    };
  }

  function openAppointmentMessage(action: AppointmentMessageAction) {
    const row = buildEditableAppointmentRow();
    if (!row || !canMessageAppointment(row)) {
      toast.error('Este cliente precisa de telefone para receber WhatsApp.');
      return;
    }

    setMessageAction(action);
    setMessageDraft(
      buildAppointmentMessage(row, action, account?.name ?? 'nossa clínica')
    );
    setMessageOpen(true);
  }

  async function handleSendAppointmentMessage() {
    if (!accountId || !selectedAppointment || !messageDraft.trim()) return;
    const row = buildEditableAppointmentRow();
    if (!row?.contact_id || !canMessageAppointment(row)) {
      toast.error('Este cliente precisa de telefone para receber WhatsApp.');
      return;
    }

    setSendingMessage(true);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: row.contact_id,
          message_type: 'text',
          content_text: messageDraft.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao enviar WhatsApp.');
      }

      const sentAt = new Date().toISOString();
      const update =
        messageAction === 'reminder'
          ? { reminder_sent_at: sentAt }
          : {
              confirmation_sent_at: sentAt,
              confirmation_requested_at: sentAt,
              confirmation_response_at: null,
              confirmation_status: 'pending',
              confirmation_request_message: messageDraft.trim(),
            };

      const { error } = await supabase
        .from('clinic_appointments')
        .update(update)
        .eq('id', selectedAppointment.id)
        .eq('account_id', accountId);

      if (error) throw error;

      void recordAgendaEvent({
        entityType: 'appointment',
        entityId: selectedAppointment.id,
        action: 'message_sent',
        reason:
          messageAction === 'reminder'
            ? 'Lembrete enviado pelo WhatsApp'
            : 'Mensagem de agendamento enviada pelo WhatsApp',
        metadata: {
          message_action: messageAction,
          contact_id: row.contact_id,
        },
      });

      toast.success(
        messageAction === 'reminder'
          ? 'Lembrete enviado pelo WhatsApp.'
          : 'Mensagem de agendamento enviada.'
      );
      setMessageOpen(false);
      closeAppointmentSheet();
      void loadAgenda();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar.');
    } finally {
      setSendingMessage(false);
    }
  }

  function openScheduleChange(
    appointment: AppointmentRow,
    targetStart?: Date,
    source: 'drag' | 'manual' = 'manual'
  ) {
    const startAt = targetStart ?? new Date(appointment.scheduled_start);
    setScheduleChangeDraft({
      appointmentId: appointment.id,
      date: dateInputValue(startAt),
      time: timeInputValue(startAt),
      type: 'rescheduled',
      reason: '',
      source,
      requestClientConfirmation: true,
      benefitDisposition: 'keep',
      confirmationMessage: buildScheduleChangeConfirmationMessage({
        appointment,
        newStart: startAt,
        businessName: account?.name ?? 'nossa clínica',
      }),
    });
    setScheduleChangeOpen(true);
  }

  function updateScheduleChangeTime(
    updates: Partial<Pick<ScheduleChangeDraft, 'date' | 'time'>>
  ) {
    setScheduleChangeDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      const appointment = appointments.find(
        (item) => item.id === next.appointmentId
      );
      if (!appointment) return next;
      return {
        ...next,
        confirmationMessage: buildScheduleChangeConfirmationMessage({
          appointment,
          newStart: appointmentDate(next.date, next.time),
          businessName: account?.name ?? 'nossa clínica',
        }),
      };
    });
  }

  function moveAppointmentToDateTime(appointmentId: string, targetStart: Date) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;

    const originalStart = new Date(appointment.scheduled_start);
    if (targetStart.getTime() === originalStart.getTime()) return;
    openScheduleChange(appointment, targetStart, 'drag');
  }

  async function confirmScheduleChange() {
    if (!accountId || !scheduleChangeDraft) return;
    const appointment = appointments.find(
      (item) => item.id === scheduleChangeDraft.appointmentId
    );
    if (!appointment) return;
    const scheduleBenefit =
      appointment.benefits?.find((item) => item.status === 'reserved') ??
      (selectedAppointment?.id === appointment.id ? appointmentBenefit : null);

    const service =
      services.find((item) => item.id === appointment.service_id) ??
      appointment.service;
    const originalStart = new Date(appointment.scheduled_start);
    const originalEnd = new Date(appointment.scheduled_end);
    const startAt = appointmentDate(
      scheduleChangeDraft.date,
      scheduleChangeDraft.time
    );
    const durationMinutes =
      service?.duration_minutes ??
      Math.max(
        15,
        Math.round((originalEnd.getTime() - originalStart.getTime()) / 60_000)
      );
    const endAt = addMinutes(startAt, durationMinutes);
    const shouldRequestConfirmation =
      scheduleChangeDraft.requestClientConfirmation;
    const changedAt = new Date().toISOString();

    if (shouldRequestConfirmation && !canMessageAppointment(appointment)) {
      toast.error(
        'Este cliente precisa de telefone para confirmar pelo WhatsApp.'
      );
      return;
    }
    if (
      shouldRequestConfirmation &&
      !scheduleChangeDraft.confirmationMessage.trim()
    ) {
      toast.error('Escreva a mensagem de confirmação para o cliente.');
      return;
    }

    if (
      !(await ensureAvailability({
        startsAt: startAt,
        endsAt: endAt,
        professionalId: appointment.professional_profile_id || null,
        roomId: appointment.room_id || null,
        excludeAppointmentId: appointment.id,
      }))
    ) {
      return;
    }

    setSavingScheduleChange(true);
    const { error } = await supabase
      .from('clinic_appointments')
      .update({
        scheduled_start: startAt.toISOString(),
        scheduled_end: endAt.toISOString(),
        original_scheduled_start:
          appointment.original_scheduled_start ?? appointment.scheduled_start,
        original_scheduled_end:
          appointment.original_scheduled_end ?? appointment.scheduled_end,
        schedule_change_count: (appointment.schedule_change_count ?? 0) + 1,
        reschedule_count:
          (appointment.reschedule_count ?? 0) +
          (scheduleChangeDraft.type === 'rescheduled' ? 1 : 0),
        last_schedule_change_at: changedAt,
        last_schedule_change_type: scheduleChangeDraft.type,
        last_reschedule_reason: scheduleChangeDraft.reason.trim() || null,
        confirmation_status: shouldRequestConfirmation
          ? 'pending'
          : 'not_required',
        confirmation_requested_at: shouldRequestConfirmation ? changedAt : null,
        confirmation_response_at: null,
        confirmation_request_message: shouldRequestConfirmation
          ? scheduleChangeDraft.confirmationMessage.trim()
          : null,
      })
      .eq('id', appointment.id)
      .eq('account_id', accountId);
    if (error) {
      toast.error(`Falha ao mover marcação: ${error.message}`);
      setSavingScheduleChange(false);
      return;
    }

    if (
      scheduleBenefit?.status === 'reserved' &&
      scheduleChangeDraft.benefitDisposition === 'release'
    ) {
      const { error: benefitError } = await supabase.rpc(
        'settle_appointment_benefit',
        {
          p_appointment_id: appointment.id,
          p_action: 'release',
        }
      );
      if (benefitError) {
        toast.error(
          `Horário alterado, mas o benefício não foi devolvido: ${benefitError.message}`
        );
      }
    }

    void recordAgendaEvent({
      entityType: 'appointment',
      entityId: appointment.id,
      action: scheduleChangeDraft.type,
      reason: scheduleChangeDraft.reason.trim() || null,
      oldStart: appointment.scheduled_start,
      oldEnd: appointment.scheduled_end,
      newStart: startAt.toISOString(),
      newEnd: endAt.toISOString(),
      metadata: {
        source: scheduleChangeDraft.source,
        contact_id: appointment.contact_id,
        service_id: appointment.service_id,
        benefit_disposition:
          scheduleBenefit?.status === 'reserved'
            ? scheduleChangeDraft.benefitDisposition
            : null,
      },
    });

    let messageFailed = false;
    if (shouldRequestConfirmation) {
      try {
        const response = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: appointment.contact_id,
            message_type: 'text',
            content_text: scheduleChangeDraft.confirmationMessage.trim(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || 'Falha ao enviar WhatsApp.');
        }

        void recordAgendaEvent({
          entityType: 'appointment',
          entityId: appointment.id,
          action: 'message_sent',
          reason: 'Pedido de confirmação da alteração enviado pelo WhatsApp',
          metadata: {
            contact_id: appointment.contact_id,
            message_action: 'schedule_change_confirmation',
          },
        });
      } catch (error) {
        messageFailed = true;
        toast.error(
          error instanceof Error
            ? `Alteração guardada, mas a mensagem não foi enviada: ${error.message}`
            : 'Alteração guardada, mas a mensagem não foi enviada.'
        );
      }
    }

    setSavingScheduleChange(false);

    if (shouldRequestConfirmation || messageFailed) {
      toast.success(
        messageFailed
          ? 'Horário atualizado. Confirmação pendente de envio.'
          : 'Horário atualizado e confirmação enviada ao cliente.'
      );
    }

    if (!shouldRequestConfirmation && !messageFailed)
      toast.success(
        scheduleChangeDraft.type === 'rescheduled'
          ? 'Marcação remarcada.'
          : 'Horário da marcação atualizado.'
      );
    setScheduleChangeOpen(false);
    setScheduleChangeDraft(null);
    closeAppointmentSheet();
    void loadAgenda();
  }

  function updateEditAction(
    action:
      'confirmed' | 'arrived' | 'completed' | 'paid' | 'no_show' | 'cancelled'
  ) {
    if (
      (action === 'no_show' || action === 'cancelled') &&
      appointmentBenefit?.status === 'reserved'
    ) {
      setPendingBenefitAction(action);
      setBenefitDisposition('release');
      setBenefitDecisionOpen(true);
      return;
    }

    applyEditStatusAction(action);
  }

  function applyEditStatusAction(
    action:
      'confirmed' | 'arrived' | 'completed' | 'paid' | 'no_show' | 'cancelled'
  ) {
    const now = new Date().toISOString();
    setEditDraft((prev) => {
      if (!prev) return prev;
      if (action === 'confirmed') return { ...prev, status: 'confirmed' };
      if (action === 'arrived') {
        return {
          ...prev,
          status: prev.status === 'scheduled' ? 'confirmed' : prev.status,
          arrivedAt: prev.arrivedAt ?? now,
        };
      }
      if (action === 'completed') return { ...prev, status: 'completed' };
      if (action === 'paid') return prev;
      if (action === 'no_show') return { ...prev, status: 'no_show' };
      return { ...prev, status: 'cancelled' };
    });
  }

  function confirmBenefitStatusAction() {
    if (!pendingBenefitAction) return;
    applyEditStatusAction(pendingBenefitAction);
    setBenefitDecisionOpen(false);
    toast.info(
      benefitDisposition === 'release'
        ? 'Ao guardar, o benefício será devolvido ao saldo.'
        : 'Ao guardar, o benefício será consumido.'
    );
  }

  async function consumeAppointmentBenefit() {
    if (!selectedAppointment || !editDraft || benefitType === 'direct') return;
    const existingVoucherWithoutPin =
      appointmentBenefit?.benefit_type === 'voucher' &&
      benefitVoucherCode.toUpperCase() ===
        appointmentBenefit.voucher?.code?.toUpperCase();
    const codeBasedBenefit =
      Boolean(benefitCodeLookup) &&
      (benefitCodeLookup?.kind === 'pack' ||
        benefitCodeLookup?.lookup_mode !== 'fallback');

    if (
      (!appointmentBenefit &&
        benefitType === 'voucher' &&
        (!benefitVoucherCode.trim() || !benefitVoucherPin.trim())) ||
      (!appointmentBenefit &&
        benefitType === 'pack' &&
        (!benefitSourceId || (codeBasedBenefit && !benefitVoucherPin.trim())))
    ) {
      toast.error('Pesquise o código e informe o PIN antes de receber.');
      return;
    }

    setSavingEdit(true);
    if (!appointmentBenefit || appointmentBenefit.status === 'released') {
      const reserveResult = codeBasedBenefit
        ? await supabase.rpc('reserve_appointment_benefit_code', {
            p_appointment_id: selectedAppointment.id,
            p_code: benefitCodeLookup?.code ?? benefitVoucherCode.trim(),
            p_pin: benefitVoucherPin.trim(),
          })
        : benefitType === 'voucher' && !existingVoucherWithoutPin
          ? await supabase.rpc('reserve_appointment_voucher', {
              p_appointment_id: selectedAppointment.id,
              p_code: benefitVoucherCode.trim(),
              p_pin: benefitVoucherPin.trim(),
            })
          : await supabase.rpc('set_appointment_benefit', {
              p_appointment_id: selectedAppointment.id,
              p_benefit_type: benefitType,
              p_source_id: benefitSourceId,
            });
      if (reserveResult.error) {
        setSavingEdit(false);
        toast.error(
          `Não foi possível validar o benefício: ${reserveResult.error.message}`
        );
        return;
      }
    }

    const { error } = await supabase.rpc('settle_appointment_benefit', {
      p_appointment_id: selectedAppointment.id,
      p_action: 'consume',
    });
    setSavingEdit(false);
    if (error) {
      toast.error(`Não foi possível consumir o benefício: ${error.message}`);
      return;
    }

    const paidAt = new Date().toISOString();
    setEditDraft((current) => (current ? { ...current, paidAt } : current));
    setAppointmentBenefit((current) =>
      current
        ? { ...current, status: 'consumed', consumed_at: paidAt }
        : current
    );
    await supabase
      .from('clinic_appointments')
      .update({ coupon_code: editDraft.couponCode.trim() || null })
      .eq('id', selectedAppointment.id);
    void recordAgendaEvent({
      entityType: 'appointment',
      entityId: selectedAppointment.id,
      action: 'updated',
      reason: 'Pagamento concluído com benefício',
      metadata: { benefit_type: benefitType, source: 'appointment_payment' },
    });
    setPaymentChoiceOpen(false);
    toast.success('Benefício consumido e pagamento registado.');
    void loadAgenda();
  }

  async function saveAppointmentSheet(
    options: { createNewAfter?: boolean } = {}
  ) {
    if (!accountId || !selectedAppointment || !editDraft) return;

    const service = selectedEditService ?? selectedAppointment.service;
    if (!editDraft.contactId) {
      toast.error('Selecione o cliente.');
      return;
    }
    if (!editDraft.serviceId || !service) {
      toast.error('Selecione o procedimento.');
      return;
    }
    const existingVoucherWithoutPin =
      benefitType === 'voucher' &&
      appointmentBenefit?.benefit_type === 'voucher' &&
      benefitVoucherCode.toUpperCase() ===
        appointmentBenefit.voucher?.code?.toUpperCase() &&
      !benefitVoucherPin;
    const codeBasedBenefit =
      Boolean(benefitCodeLookup) &&
      (benefitCodeLookup?.kind === 'pack' ||
        benefitCodeLookup?.lookup_mode !== 'fallback') &&
      benefitType !== 'direct';
    if (
      (benefitType === 'voucher' &&
        (!benefitVoucherCode.trim() ||
          (!benefitVoucherPin.trim() && !existingVoucherWithoutPin))) ||
      (benefitType === 'pack' &&
        (!benefitSourceId || (codeBasedBenefit && !benefitVoucherPin.trim())))
    ) {
      toast.error('Informe o código e PIN do voucher ou selecione o pack.');
      return;
    }
    const originalBenefitSource =
      appointmentBenefit?.benefit_type === 'voucher'
        ? appointmentBenefit.voucher_id
        : appointmentBenefit?.client_pack_id;
    if (
      appointmentBenefit?.status === 'consumed' &&
      (benefitType !== appointmentBenefit.benefit_type ||
        benefitSourceId !== originalBenefitSource)
    ) {
      toast.error('Um benefício já consumido não pode ser substituído.');
      return;
    }

    const startAt = appointmentDate(editDraft.date, editDraft.time);
    const endAt = addMinutes(startAt, service.duration_minutes);
    const scheduleChanged =
      startAt.toISOString() !== selectedAppointment.scheduled_start ||
      endAt.toISOString() !== selectedAppointment.scheduled_end;
    const scheduleChangedAt = new Date().toISOString();

    if (
      !(await ensureAvailability({
        startsAt: startAt,
        endsAt: endAt,
        professionalId: editDraft.professionalProfileId || null,
        roomId: editDraft.roomId || null,
        excludeAppointmentId: selectedAppointment.id,
      }))
    ) {
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase
      .from('clinic_appointments')
      .update({
        contact_id: editDraft.contactId,
        service_id: editDraft.serviceId,
        professional_profile_id: editDraft.professionalProfileId || null,
        room_id: editDraft.roomId || null,
        scheduled_start: startAt.toISOString(),
        scheduled_end: endAt.toISOString(),
        original_scheduled_start:
          selectedAppointment.original_scheduled_start ??
          selectedAppointment.scheduled_start,
        original_scheduled_end:
          selectedAppointment.original_scheduled_end ??
          selectedAppointment.scheduled_end,
        schedule_change_count:
          (selectedAppointment.schedule_change_count ?? 0) +
          (scheduleChanged ? 1 : 0),
        last_schedule_change_at: scheduleChanged
          ? scheduleChangedAt
          : selectedAppointment.last_schedule_change_at,
        last_schedule_change_type: scheduleChanged
          ? 'schedule_changed'
          : selectedAppointment.last_schedule_change_type,
        last_reschedule_reason: scheduleChanged
          ? 'Alteração manual na ficha da marcação'
          : selectedAppointment.last_reschedule_reason,
        status: editDraft.status,
        price: Number(service.price ?? selectedAppointment.price ?? 0),
        currency: service.currency || defaultCurrency,
        notes: editDraft.notes.trim() || null,
        coupon_code: editDraft.couponCode.trim() || null,
        treatment_notes: editDraft.treatmentNotes.trim() || null,
        arrived_at: editDraft.arrivedAt,
        paid_at: editDraft.paidAt,
        cancelled_at:
          editDraft.status === 'cancelled'
            ? (selectedAppointment.cancelled_at ?? new Date().toISOString())
            : null,
      })
      .eq('id', selectedAppointment.id)
      .eq('account_id', accountId);
    if (error) {
      setSavingEdit(false);
      toast.error(`Falha ao guardar marcação: ${error.message}`);
      return;
    }

    if (
      appointmentBenefit?.status !== 'consumed' &&
      !(benefitType === 'voucher' && existingVoucherWithoutPin)
    ) {
      const { error: benefitError } = codeBasedBenefit
        ? await supabase.rpc('reserve_appointment_benefit_code', {
            p_appointment_id: selectedAppointment.id,
            p_code: benefitCodeLookup?.code ?? benefitVoucherCode.trim(),
            p_pin: benefitVoucherPin.trim(),
          })
        : benefitType === 'voucher'
          ? await supabase.rpc('reserve_appointment_voucher', {
              p_appointment_id: selectedAppointment.id,
              p_code: benefitVoucherCode.trim(),
              p_pin: benefitVoucherPin.trim(),
            })
          : await supabase.rpc('set_appointment_benefit', {
              p_appointment_id: selectedAppointment.id,
              p_benefit_type: benefitType,
              p_source_id: benefitSourceId || null,
            });
      if (benefitError) {
        setSavingEdit(false);
        toast.error(
          `Marcação guardada, mas o benefício falhou: ${benefitError.message}`
        );
        return;
      }
    }

    if (
      appointmentBenefit?.status !== 'consumed' &&
      (editDraft.status === 'cancelled' ||
        editDraft.status === 'no_show' ||
        (Boolean(editDraft.paidAt) && benefitType !== 'direct'))
    ) {
      const settlementAction =
        editDraft.status === 'cancelled' || editDraft.status === 'no_show'
          ? benefitDisposition
          : 'consume';
      const { error: settlementError } = await supabase.rpc(
        'settle_appointment_benefit',
        {
          p_appointment_id: selectedAppointment.id,
          p_action: settlementAction,
        }
      );
      if (settlementError) {
        setSavingEdit(false);
        toast.error(
          `Falha ao processar o benefício: ${settlementError.message}`
        );
        return;
      }
    }
    setSavingEdit(false);

    if (scheduleChanged) {
      void recordAgendaEvent({
        entityType: 'appointment',
        entityId: selectedAppointment.id,
        action: 'schedule_changed',
        reason: 'Alteração manual na ficha da marcação',
        oldStart: selectedAppointment.scheduled_start,
        oldEnd: selectedAppointment.scheduled_end,
        newStart: startAt.toISOString(),
        newEnd: endAt.toISOString(),
        metadata: { source: 'appointment_sheet' },
      });
    }

    if (editDraft.status !== selectedAppointment.status) {
      void recordAgendaEvent({
        entityType: 'appointment',
        entityId: selectedAppointment.id,
        action: 'status_changed',
        reason: `${STATUS_LABEL[selectedAppointment.status]} → ${STATUS_LABEL[editDraft.status]}`,
        oldStart: selectedAppointment.scheduled_start,
        oldEnd: selectedAppointment.scheduled_end,
        newStart: startAt.toISOString(),
        newEnd: endAt.toISOString(),
        metadata: {
          previous_status: selectedAppointment.status,
          new_status: editDraft.status,
          benefit_disposition:
            editDraft.status === 'cancelled' || editDraft.status === 'no_show'
              ? benefitDisposition
              : null,
        },
      });
    }

    if (benefitType !== 'direct') {
      void recordAgendaEvent({
        entityType: 'appointment',
        entityId: selectedAppointment.id,
        action: 'updated',
        reason:
          benefitType === 'voucher'
            ? 'Voucher associado à marcação'
            : 'Sessão de pack associada à marcação',
        metadata: {
          benefit_type: benefitType,
          benefit_source_id: benefitSourceId,
          settlement:
            editDraft.status === 'cancelled' || editDraft.status === 'no_show'
              ? benefitDisposition === 'release'
                ? 'released'
                : 'consumed'
              : editDraft.paidAt
                ? 'consumed'
                : 'reserved',
        },
      });
    }

    toast.success('Marcação guardada.');
    closeAppointmentSheet();
    void loadAgenda();

    if (options.createNewAfter) {
      window.setTimeout(() => openAppointmentDialog(), 0);
    }
  }

  const step = view === 'week' ? 7 : 1;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            Agenda
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Calendário diário ou semanal por profissional e sala.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate((date) => addDays(date, -step))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setSelectedDate(new Date())}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate((date) => addDays(date, step))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <div className="border-border bg-card text-foreground min-h-9 rounded-md border px-3 py-2 text-sm font-medium capitalize">
            {formatRangeTitle(selectedDate, view)}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void loadAgenda()}
            disabled={loading}
            title={
              lastUpdatedAt
                ? `Atualizado às ${lastUpdatedAt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
                : 'Atualizar agenda'
            }
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
          <Link
            href="/settings?tab=clinic"
            className="border-border bg-background hover:bg-muted hover:text-foreground inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap transition-colors"
          >
            <Settings2 className="size-4" />
            Configurar clínica
          </Link>
          {canOperate ? (
            <>
              <Button variant="outline" onClick={openTimeBlockDialog}>
                <Lock className="size-4" />
                Bloquear horário
              </Button>
              <Button onClick={() => openAppointmentDialog()}>
                <Plus className="size-4" />
                Agendamento
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="rounded-lg">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 xl:grid-cols-[auto_auto_1fr_auto] xl:items-center">
            <SegmentedControl
              value={view}
              options={[
                { value: 'day', label: 'Dia' },
                { value: 'week', label: 'Semana' },
              ]}
              onChange={(value) => setView(value as CalendarView)}
            />
            <SegmentedControl
              value={resourceMode}
              options={[
                { value: 'all', label: 'Geral' },
                { value: 'professional', label: 'Profissional' },
                { value: 'room', label: 'Sala' },
              ]}
              onChange={(value) => setResourceMode(value as ResourceMode)}
            />
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                type="date"
                value={dateInputValue(selectedDate)}
                onChange={(event) =>
                  setSelectedDate(new Date(`${event.target.value}T12:00:00`))
                }
              />
              <NativeSelect
                value={selectedProfessionalId}
                disabled={resourceMode !== 'professional'}
                onChange={setSelectedProfessionalId}
              >
                <option value="all">Todos os profissionais</option>
                {visibleProfessionals.map((member) => (
                  <option key={member.id} value={member.id}>
                    {professionalName(member)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={selectedRoomId}
                disabled={resourceMode !== 'room'}
                onChange={setSelectedRoomId}
              >
                <option value="all">Todas as salas</option>
                {activeRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="text-muted-foreground grid grid-cols-3 gap-2 text-xs xl:min-w-80">
              <Stat label="Agenda" value={filteredAppointments.length} />
              <Stat
                label="Confirmados"
                value={
                  filteredAppointments.filter(
                    (item) => item.status === 'confirmed'
                  ).length
                }
              />
              <Stat
                label="Previsto"
                value={formatCurrency(totalRevenue, defaultCurrency)}
              />
            </div>
          </div>
          <div className="border-border grid gap-2 border-t pt-3 sm:grid-cols-2 xl:grid-cols-5">
            <AgendaBenefitStat
              icon={HeartHandshake}
              label="Indicações"
              value={referralAppointments}
              detail="benefício de novo cliente"
              tone="emerald"
            />
            <AgendaBenefitStat
              icon={Gift}
              label="Vouchers"
              value={voucherReserved + voucherUsed}
              detail={`${voucherReserved} agendados · ${voucherUsed} utilizados`}
              tone="amber"
            />
            <AgendaBenefitStat
              icon={PackageCheck}
              label="Packs"
              value={packReserved + packUsed}
              detail={`${packReserved} agendados · ${packUsed} utilizados`}
              tone="violet"
            />
            <AgendaBenefitStat
              icon={CircleDollarSign}
              label="Pagamentos"
              value={paidAppointments}
              detail={`${partialPayments} pagamentos parciais`}
              tone="emerald"
            />
            <AgendaBenefitStat
              icon={Clock3}
              label={view === 'day' ? 'Resumo do dia' : 'Resumo da semana'}
              value={filteredAppointments.length}
              detail={`${filteredAppointments.filter((item) => !item.paid_at && item.status !== 'cancelled').length} por liquidar`}
              tone="sky"
            />
          </div>
        </CardContent>
      </Card>

      {schemaMissing ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-5 text-sm text-amber-700 dark:text-amber-300">
            A agenda precisa das migrations <code>045_clinic_agenda.sql</code> e{' '}
            <code>046_clinic_resources.sql</code>. Para os botões de ação da
            ficha, aplique também{' '}
            <code>047_clinic_appointment_actions.sql</code> e{' '}
            <code>048_clinic_backoffice_polish.sql</code>.
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : view === 'week' ? (
        <WeekCalendar
          start={startOfWeek(selectedDate)}
          appointments={filteredAppointments}
          blocks={filteredTimeBlocks}
          currency={defaultCurrency}
          onSelect={openAppointmentSheet}
          onMove={canOperate ? moveAppointmentToDateTime : undefined}
          onSelectBlock={openTimeBlockSheet}
          onCreateAt={
            canOperate
              ? (date) => openAppointmentDialog(undefined, null, date)
              : undefined
          }
        />
      ) : (
        <DayCalendar
          appointments={filteredAppointments}
          blocks={filteredTimeBlocks}
          currency={defaultCurrency}
          selectedDate={selectedDate}
          onSelect={openAppointmentSheet}
          onMove={canOperate ? moveAppointmentToDateTime : undefined}
          onSelectBlock={openTimeBlockSheet}
          onCreateAt={
            canOperate
              ? (date) => openAppointmentDialog(undefined, null, date)
              : undefined
          }
        />
      )}

      <Dialog
        open={Boolean(selectedAppointment && editDraft)}
        onOpenChange={(open) => {
          if (!open) closeAppointmentSheet();
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]">
          {selectedAppointment && editDraft ? (
            <>
              <DialogHeader className="border-border shrink-0 border-b px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4 pr-10">
                  <div>
                    <DialogTitle>Ficha da marcação</DialogTitle>
                    <div className="text-muted-foreground mt-2 grid gap-1 text-xs sm:grid-cols-2">
                      <span>
                        Criada:{' '}
                        {new Date(
                          selectedAppointment.created_at
                        ).toLocaleString('pt-PT')}
                      </span>
                      <span>
                        Modificada:{' '}
                        {new Date(
                          selectedAppointment.updated_at
                        ).toLocaleString('pt-PT')}
                      </span>
                    </div>
                  </div>
                  <div className="grid min-w-[420px] flex-1 grid-cols-3 gap-2 sm:flex-none">
                    <HeaderStatus
                      label="Estado"
                      value={STATUS_LABEL[editDraft.status]}
                    />
                    <HeaderStatus
                      label="Chegada"
                      value={editDraft.arrivedAt ? 'Registada' : 'Pendente'}
                      active={Boolean(editDraft.arrivedAt)}
                    />
                    <HeaderStatus
                      label="Pagamento"
                      value={editDraft.paidAt ? 'Registado' : 'Pendente'}
                      active={Boolean(editDraft.paidAt)}
                    />
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid items-start gap-5">
                  <section className="border-border bg-muted/20 rounded-md border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Dados operacionais
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          Identificação, origem, confirmação e contexto
                          financeiro desta marcação.
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono">
                        #{selectedAppointment.id.slice(0, 8).toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                      <AppointmentDatum
                        label="Origem"
                        value={appointmentSourceLabel(
                          selectedAppointment.source
                        )}
                      />
                      <AppointmentDatum
                        label="Horário original"
                        value={
                          selectedAppointment.original_scheduled_start
                            ? new Date(
                                selectedAppointment.original_scheduled_start
                              ).toLocaleString('pt-PT', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : 'Sem alteração'
                        }
                      />
                      <AppointmentDatum
                        label="Alterações / remarcações"
                        value={`${selectedAppointment.schedule_change_count ?? 0} / ${selectedAppointment.reschedule_count ?? 0}`}
                      />
                      <AppointmentDatum
                        label="Confirmação"
                        value={confirmationStatusLabel(
                          selectedAppointment.confirmation_status
                        )}
                      />
                      <AppointmentDatum
                        label="Benefício"
                        value={
                          selectedAppointment.referral_id
                            ? `Indique & Ganhe · ${formatCurrency(Number(selectedAppointment.referral_discount_amount ?? 0), selectedAppointment.currency || defaultCurrency)} desconto`
                            : appointmentBenefit
                              ? `${appointmentBenefit.benefit_type === 'pack' ? 'Pack' : 'Voucher'} · ${benefitStatusLabel(appointmentBenefit.status)}`
                              : 'Pagamento direto'
                        }
                      />
                      <AppointmentDatum
                        label="Valor da marcação"
                        value={formatCurrency(
                          Number(selectedAppointment.price ?? 0),
                          selectedAppointment.currency || defaultCurrency
                        )}
                      />
                      <AppointmentDatum
                        label="Preço original / desconto"
                        value={
                          selectedAppointment.referral_id
                            ? `${formatCurrency(Number(selectedAppointment.original_price ?? selectedAppointment.price ?? 0), selectedAppointment.currency || defaultCurrency)} / -${formatCurrency(Number(selectedAppointment.referral_discount_amount ?? 0), selectedAppointment.currency || defaultCurrency)}`
                            : 'Sem desconto de indicação'
                        }
                      />
                      <AppointmentDatum
                        label="Recebido"
                        value={formatCurrency(
                          (selectedAppointment.sales ?? []).reduce(
                            (sum, sale) =>
                              sum +
                              (!['voided', 'refunded'].includes(sale.status)
                                ? Number(sale.paid_amount ?? 0)
                                : 0),
                            0
                          ),
                          selectedAppointment.currency || defaultCurrency
                        )}
                      />
                      <AppointmentDatum
                        label="Lembrete"
                        value={
                          selectedAppointment.reminder_sent_at
                            ? `Enviado ${new Date(selectedAppointment.reminder_sent_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`
                            : 'Não enviado'
                        }
                      />
                      <AppointmentDatum
                        label="Anamnese"
                        value={
                          selectedAppointment.anamnesis
                            ? selectedAppointment.anamnesis.status === 'pending'
                              ? 'Aguardando preenchimento'
                              : selectedAppointment.anamnesis.status ===
                                  'reviewed'
                                ? 'Revista pela equipa'
                                : 'Preenchida pelo cliente'
                            : 'Ainda não emitida'
                        }
                      />
                    </div>
                    {selectedAppointment.anamnesis ? (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          render={
                            <Link
                              href={`/anamnese/${selectedAppointment.anamnesis.public_token}`}
                              target="_blank"
                            />
                          }
                        >
                          <ClipboardList /> Abrir ficha de anamnese
                        </Button>
                      </div>
                    ) : null}
                  </section>

                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Profissional">
                        <NativeSelect
                          value={editDraft.professionalProfileId}
                          disabled={!canOperate}
                          onChange={(value) =>
                            setEditDraft((prev) =>
                              prev
                                ? { ...prev, professionalProfileId: value }
                                : prev
                            )
                          }
                        >
                          <option value="">Sem profissional</option>
                          {visibleProfessionals.map((member) => (
                            <option key={member.id} value={member.id}>
                              {professionalName(member)}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label="Sala">
                        <NativeSelect
                          value={editDraft.roomId}
                          disabled={!canOperate}
                          onChange={(value) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, roomId: value } : prev
                            )
                          }
                        >
                          <option value="">Sem sala</option>
                          {activeRooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                    </div>

                    <Field label="Cliente">
                      <div className="flex gap-2">
                        <NativeSelect
                          value={editDraft.contactId}
                          disabled={!canOperate}
                          onChange={(value) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, contactId: value } : prev
                            )
                          }
                        >
                          <option value="">Selecione um cliente</option>
                          {contacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {appointmentContactLabel(contact)}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setQuickContactOpen(true)}
                          disabled={!canOperate}
                        >
                          Novo cliente
                        </Button>
                      </div>
                    </Field>

                    {(() => {
                      const contact =
                        contacts.find(
                          (item) => item.id === editDraft.contactId
                        ) ?? selectedAppointment.contact;
                      return (
                        <div className="border-border bg-muted/30 grid gap-3 rounded-md border p-3 text-xs sm:grid-cols-2 lg:grid-cols-[0.7fr_1fr_1.2fr_1fr_auto] lg:items-center">
                          <div>
                            <p className="text-muted-foreground">
                              Ref. cliente
                            </p>
                            <p className="text-foreground font-semibold">
                              {contact?.client_reference ?? '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Telefone</p>
                            <p className="text-foreground font-semibold">
                              {contact?.phone ?? '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Empresa</p>
                            <p className="text-foreground font-semibold">
                              {contact?.company ?? '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">E-mail</p>
                            <p className="text-foreground truncate font-semibold">
                              {contact?.email ?? '--'}
                            </p>
                          </div>
                          {contact?.id ? (
                            <Link
                              href={`/contacts/${contact.id}`}
                              className={buttonVariants({
                                size: 'sm',
                                variant: 'outline',
                              })}
                            >
                              <UserCheck className="size-4" /> Cliente 360
                            </Link>
                          ) : null}
                        </div>
                      );
                    })()}

                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_120px]">
                      <Field label="Serviço">
                        <NativeSelect
                          value={editDraft.serviceId}
                          disabled={!canOperate}
                          onChange={(value) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, serviceId: value } : prev
                            )
                          }
                        >
                          <option value="">Selecione serviço</option>
                          {activeServices.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label="Duração">
                        <Input
                          readOnly
                          value={
                            selectedEditService
                              ? `${selectedEditService.duration_minutes} min`
                              : ''
                          }
                        />
                      </Field>
                      <Field label="Preço">
                        <Input
                          readOnly
                          value={
                            selectedEditService
                              ? formatCurrency(
                                  Number(selectedEditService.price),
                                  selectedEditService.currency ||
                                    defaultCurrency
                                )
                              : ''
                          }
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_120px_1fr]">
                      <Field label="Data">
                        <Input
                          type="date"
                          value={editDraft.date}
                          disabled
                          title="Use a ação Remarcar para alterar a data com histórico e confirmação."
                        />
                      </Field>
                      <Field label="Hora">
                        <Input
                          type="time"
                          value={editDraft.time}
                          disabled
                          title="Use a ação Remarcar para alterar o horário com histórico e confirmação."
                        />
                      </Field>
                      <Field label="Código de benefício">
                        <div className="flex gap-2">
                          <Input
                            value={editDraft.couponCode}
                            onChange={(event) => {
                              const code = event.target.value.toUpperCase();
                              setEditDraft((prev) =>
                                prev ? { ...prev, couponCode: code } : prev
                              );
                              if (code !== benefitCodeLookup?.code) {
                                setBenefitCodeLookup(null);
                                setBenefitVoucherPin('');
                              }
                            }}
                            onBlur={() => {
                              if (
                                editDraft.couponCode.trim() &&
                                editDraft.couponCode !==
                                  appointmentBenefit?.voucher?.code
                              ) {
                                void lookupBenefitCode();
                              }
                            }}
                            placeholder="Voucher, cartão ou pack"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Pesquisar benefício"
                            disabled={
                              lookingUpBenefit || !editDraft.couponCode.trim()
                            }
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void lookupBenefitCode()}
                          >
                            {lookingUpBenefit ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Search className="size-4" />
                            )}
                          </Button>
                        </div>
                      </Field>
                    </div>

                    <AppointmentSection
                      value="notes"
                      icon={<StickyNote className="size-4" />}
                      title="Observações"
                      summary={
                        editDraft.notes.trim()
                          ? 'Contém notas internas'
                          : 'Sem observações'
                      }
                    >
                      <Textarea
                        value={editDraft.notes}
                        onChange={(event) =>
                          setEditDraft((prev) =>
                            prev ? { ...prev, notes: event.target.value } : prev
                          )
                        }
                        className="min-h-24"
                        placeholder="Preferências, contexto e observações internas desta marcação."
                      />
                    </AppointmentSection>
                  </div>

                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <AppointmentSection
                      value="benefits"
                      icon={<CircleDollarSign className="size-4" />}
                      title="Pagamento e benefícios"
                      summary={
                        loadingBenefits
                          ? 'A carregar'
                          : appointmentBenefit
                            ? benefitType === 'pack'
                              ? 'Pack associado'
                              : 'Voucher associado'
                            : 'Pagamento direto'
                      }
                    >
                      {benefitCodeLookup ? (
                        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                              {benefitCodeLookup.label}
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">
                              {benefitCodeLookup.kind === 'pack'
                                ? `${benefitCodeLookup.remaining_sessions ?? 0}/${benefitCodeLookup.total_sessions ?? 0} sessões disponíveis`
                                : benefitCodeLookup.voucher_type === 'service'
                                  ? `${benefitCodeLookup.remaining_uses ?? 0} utilização disponível`
                                  : formatCurrency(
                                      Number(benefitCodeLookup.balance ?? 0),
                                      benefitCodeLookup.currency ??
                                        defaultCurrency
                                    )}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-emerald-700 uppercase dark:text-emerald-300">
                            PIN necessário
                          </span>
                        </div>
                      ) : null}
                      <div className="bg-muted grid grid-cols-3 gap-1 rounded-md p-1">
                        {(
                          [
                            ['direct', 'Direto', CircleDollarSign],
                            ['voucher', 'Voucher', Gift],
                            ['pack', 'Pack', PackageCheck],
                          ] as const
                        ).map(([value, label, Icon]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={appointmentBenefit?.status === 'consumed'}
                            onClick={() => {
                              setBenefitType(value);
                              setBenefitSourceId('');
                              setBenefitCodeLookup(null);
                              if (value === 'direct') {
                                setBenefitVoucherCode('');
                                setBenefitVoucherPin('');
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, couponCode: '' }
                                    : current
                                );
                              }
                            }}
                            className={cn(
                              'flex min-h-14 flex-col items-center justify-center gap-1 rounded px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                              benefitType === value
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Icon className="size-4" />
                            {label}
                          </button>
                        ))}
                      </div>

                      {benefitType === 'voucher' ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px]">
                          <Field label="Código">
                            <Input
                              value={benefitVoucherCode}
                              disabled={
                                appointmentBenefit?.status === 'consumed'
                              }
                              onChange={(event) =>
                                setBenefitVoucherCode(
                                  event.target.value.toUpperCase()
                                )
                              }
                              placeholder="Ex.: A1B2C3D4"
                            />
                          </Field>
                          <Field label="PIN">
                            <Input
                              type="password"
                              inputMode="numeric"
                              value={benefitVoucherPin}
                              disabled={
                                appointmentBenefit?.status === 'consumed'
                              }
                              onChange={(event) =>
                                setBenefitVoucherPin(
                                  event.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 8)
                                )
                              }
                              placeholder={
                                appointmentBenefit ? '••••••' : 'PIN'
                              }
                            />
                          </Field>
                          <p className="text-muted-foreground col-span-full text-xs">
                            O código e o PIN validam o titular, a modalidade, o
                            saldo e a validade.
                          </p>
                        </div>
                      ) : null}

                      {benefitType === 'pack' && benefitCodeLookup ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px]">
                          <Input value={benefitCodeLookup.code} readOnly />
                          <Input
                            type="password"
                            inputMode="numeric"
                            value={benefitVoucherPin}
                            onChange={(event) =>
                              setBenefitVoucherPin(
                                event.target.value
                                  .replace(/\D/g, '')
                                  .slice(0, 8)
                              )
                            }
                            placeholder="PIN"
                          />
                        </div>
                      ) : benefitType === 'pack' ? (
                        <div className="mt-3 space-y-2">
                          <NativeSelect
                            value={benefitSourceId}
                            onChange={setBenefitSourceId}
                            disabled={appointmentBenefit?.status === 'consumed'}
                          >
                            <option value="">Selecione um pack</option>
                            {availablePacks.map((clientPack) => {
                              const balance = clientPack.balances?.find(
                                (item) =>
                                  item.service_id === editDraft.serviceId
                              );
                              return (
                                <option
                                  key={clientPack.id}
                                  value={clientPack.id}
                                >
                                  {clientPack.pack?.name ?? 'Pack'} ·{' '}
                                  {balance?.remaining_sessions ?? 0} sessões
                                </option>
                              );
                            })}
                          </NativeSelect>
                          {!loadingBenefits && availablePacks.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              Nenhum pack ativo inclui este serviço.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {appointmentBenefit ? (
                        <div className="mt-3 flex items-center justify-between rounded-md bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                          <span>
                            {appointmentBenefit.status === 'consumed'
                              ? 'Benefício consumido'
                              : 'Benefício reservado'}
                          </span>
                          <span className="font-semibold">
                            {appointmentBenefit.benefit_type === 'voucher'
                              ? formatCurrency(
                                  Number(appointmentBenefit.reserved_amount),
                                  defaultCurrency
                                )
                              : '1 sessão'}
                          </span>
                        </div>
                      ) : null}
                      {selectedAppointment.sales?.map((sale) => (
                        <button
                          key={sale.id}
                          type="button"
                          onClick={() =>
                            router.push(`/finance?tab=sales#sale-${sale.id}`)
                          }
                          className="border-border hover:bg-muted mt-2 w-full rounded-md border px-3 py-2 text-left text-xs"
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-semibold">
                              {sale.status === 'paid'
                                ? 'Pagamento concluído'
                                : sale.status === 'refunded'
                                  ? 'Pagamento reembolsado'
                                  : sale.status === 'voided'
                                    ? 'Venda anulada'
                                    : sale.status === 'partially_paid'
                                      ? 'Pagamento parcial'
                                      : 'Pagamento pendente'}
                            </span>
                            <span>
                              {formatCurrency(
                                Number(sale.paid_amount),
                                sale.currency || defaultCurrency
                              )}
                              {' / '}
                              {formatCurrency(
                                Number(sale.total_amount),
                                sale.currency || defaultCurrency
                              )}
                            </span>
                          </span>
                          <span className="text-muted-foreground mt-1 block">
                            {(sale.payments ?? [])
                              .filter(
                                (payment) => payment.status === 'confirmed'
                              )
                              .map((payment) =>
                                paymentMethodLabel(payment.method)
                              )
                              .join(' + ') || 'Sem recebimento confirmado'}
                            {' · Abrir venda original'}
                          </span>
                        </button>
                      ))}
                    </AppointmentSection>

                    <AppointmentSection
                      value="actions"
                      icon={<CalendarCheck className="size-4" />}
                      title="Ações da marcação"
                      summary="Estado, mensagens e remarcação"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {canOperate ? (
                          <>
                            <ActionButton
                              tone="violet"
                              onClick={() =>
                                openScheduleChange(selectedAppointment)
                              }
                            >
                              <CalendarClock className="size-4" /> Remarcar
                            </ActionButton>
                            <ActionButton
                              tone="sky"
                              active={Boolean(
                                selectedAppointment.confirmation_sent_at
                              )}
                              onClick={() =>
                                openAppointmentMessage('confirmation')
                              }
                            >
                              <MessageCircle className="size-4" /> Mensagem
                            </ActionButton>
                            <ActionButton
                              tone="amber"
                              active={Boolean(
                                selectedAppointment.reminder_sent_at
                              )}
                              onClick={() => openAppointmentMessage('reminder')}
                            >
                              <BellRing className="size-4" /> Lembrete
                            </ActionButton>
                          </>
                        ) : null}
                        {canOperate ? (
                          <>
                            <ActionButton
                              tone="emerald"
                              active={editDraft.status === 'confirmed'}
                              onClick={() => updateEditAction('confirmed')}
                            >
                              <CheckCircle2 className="size-4" /> Confirmada
                            </ActionButton>
                            <ActionButton
                              tone="sky"
                              active={Boolean(editDraft.arrivedAt)}
                              onClick={() => updateEditAction('arrived')}
                            >
                              <UserCheck className="size-4" /> Chegou
                            </ActionButton>
                            <ActionButton
                              tone="violet"
                              active={editDraft.status === 'completed'}
                              onClick={() => updateEditAction('completed')}
                            >
                              <CalendarCheck className="size-4" /> Concluir
                            </ActionButton>
                            <ActionButton
                              tone="emerald"
                              active={Boolean(editDraft.paidAt)}
                              onClick={() => setPaymentChoiceOpen(true)}
                            >
                              <CreditCard className="size-4" /> Receber
                            </ActionButton>
                            <ActionButton
                              tone="amber"
                              active={editDraft.status === 'no_show'}
                              onClick={() => updateEditAction('no_show')}
                            >
                              <ClipboardList className="size-4" /> Faltou
                            </ActionButton>
                            <ActionButton
                              danger
                              active={editDraft.status === 'cancelled'}
                              onClick={() => updateEditAction('cancelled')}
                            >
                              <X className="size-4" /> Cancelar
                            </ActionButton>
                          </>
                        ) : null}
                      </div>
                    </AppointmentSection>
                  </div>

                  <AppointmentSection
                    value="treatment"
                    icon={<ClipboardList className="size-4" />}
                    title="Ficha de tratamento"
                    summary={
                      editDraft.treatmentNotes.trim()
                        ? 'Ficha preenchida'
                        : 'Sem registo clínico'
                    }
                  >
                    <Textarea
                      value={editDraft.treatmentNotes}
                      onChange={(event) =>
                        setEditDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                treatmentNotes: event.target.value,
                              }
                            : prev
                        )
                      }
                      className="min-h-28"
                      placeholder="Evolução, preferências, cuidados e observações clínicas do atendimento."
                    />
                  </AppointmentSection>

                  <AppointmentSection
                    value="history"
                    icon={<History className="size-4" />}
                    title="Histórico da agenda"
                    summary={`${appointmentEvents.length} registo${appointmentEvents.length === 1 ? '' : 's'}`}
                  >
                    <AgendaEventList events={appointmentEvents} compact />
                  </AppointmentSection>
                </div>
              </div>

              <div className="border-border bg-background shrink-0 border-t px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="outline" onClick={closeAppointmentSheet}>
                    Fechar marcação
                  </Button>
                  {canOperate ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          saveAppointmentSheet({ createNewAfter: true })
                        }
                        disabled={savingEdit}
                      >
                        {savingEdit ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                        Guardar e criar nova
                      </Button>
                      <Button
                        onClick={() => saveAppointmentSheet()}
                        disabled={savingEdit}
                      >
                        {savingEdit ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CalendarCheck className="size-4" />
                        )}
                        Guardar
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      Consulta apenas. O seu cargo não permite alterar a agenda.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={benefitDecisionOpen}
        onOpenChange={(open) => {
          setBenefitDecisionOpen(open);
          if (!open) setPendingBenefitAction(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pendingBenefitAction === 'no_show'
                ? 'Registar falta'
                : 'Cancelar marcação'}
            </DialogTitle>
            <DialogDescription>
              Esta marcação tem um{' '}
              {appointmentBenefit?.benefit_type === 'pack'
                ? 'pack reservado'
                : 'voucher reservado'}
              . Defina o que acontece com ele antes de continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setBenefitDisposition('release')}
              className={cn(
                'flex items-start gap-3 rounded-md border p-4 text-left transition-colors',
                benefitDisposition === 'release'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-border hover:bg-muted'
              )}
            >
              <PackageCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <span>
                <span className="block font-semibold">Devolver ao saldo</span>
                <span className="text-muted-foreground block text-xs">
                  O cliente não perde valor nem sessão e poderá usar o benefício
                  noutra marcação.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBenefitDisposition('consume')}
              className={cn(
                'flex items-start gap-3 rounded-md border p-4 text-left transition-colors',
                benefitDisposition === 'consume'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-border hover:bg-muted'
              )}
            >
              <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <span>
                <span className="block font-semibold">
                  Consumir o benefício
                </span>
                <span className="text-muted-foreground block text-xs">
                  Desconta o valor ou uma sessão, por exemplo quando a falta ou
                  o cancelamento é imputável ao cliente.
                </span>
              </span>
            </button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBenefitDecisionOpen(false)}
            >
              Voltar
            </Button>
            <Button onClick={confirmBenefitStatusAction}>
              Confirmar decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentChoiceOpen} onOpenChange={setPaymentChoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receber pagamento</DialogTitle>
            <DialogDescription>
              Escolha como esta marcação será liquidada. O estado “Pago” só é
              aplicado depois da confirmação financeira.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && editDraft ? (
            <div className="space-y-3">
              <div className="bg-muted/40 grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="truncate font-semibold">
                    {appointmentContactLabel(selectedAppointment.contact)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">A receber</p>
                  <p className="font-semibold">
                    {formatCurrency(
                      Number(selectedAppointment.price ?? 0),
                      selectedAppointment.currency || defaultCurrency
                    )}
                  </p>
                </div>
              </div>

              {benefitType !== 'direct' ? (
                <button
                  type="button"
                  onClick={() => void consumeAppointmentBenefit()}
                  disabled={savingEdit}
                  className="flex w-full items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition-colors hover:bg-emerald-500/15 disabled:opacity-60"
                >
                  {savingEdit ? (
                    <Loader2 className="size-5 animate-spin text-emerald-700" />
                  ) : benefitType === 'pack' ? (
                    <PackageCheck className="size-5 text-emerald-700" />
                  ) : (
                    <Gift className="size-5 text-emerald-700" />
                  )}
                  <span>
                    <span className="block font-semibold">
                      Consumir{' '}
                      {benefitType === 'pack' ? 'sessão do pack' : 'voucher'}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      Valida o PIN, baixa o saldo e conclui o pagamento.
                    </span>
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/finance?contact=${editDraft.contactId}&appointment=${selectedAppointment.id}`
                  )
                }
                className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex w-full items-center gap-3 rounded-md border p-4 text-left transition-colors"
              >
                <CircleDollarSign className="text-primary size-5" />
                <span>
                  <span className="block font-semibold">Finalizar no POS</span>
                  <span className="text-muted-foreground block text-xs">
                    Dinheiro, cartão, MB Way, pagamento parcial ou combinado.
                  </span>
                </span>
              </button>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentChoiceOpen(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {messageAction === 'reminder'
                ? 'Enviar lembrete'
                : 'Enviar mensagem de agendamento'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="border-border bg-muted/30 rounded-md border p-3 text-xs">
              <p className="text-muted-foreground">Destino</p>
              <p className="text-foreground font-semibold">
                {appointmentContactLabel(
                  buildEditableAppointmentRow()?.contact
                )}
              </p>
            </div>
            <Field label="Mensagem">
              <Textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                className="min-h-48"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendAppointmentMessage}
              disabled={sendingMessage || !messageDraft.trim()}
            >
              {sendingMessage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Enviar WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={blockOpen}
        onOpenChange={(open) => {
          setBlockOpen(open);
          if (!open) {
            setEditingBlockId(null);
            setBlockEvents([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingBlockId ? 'Ficha do bloqueio' : 'Bloquear horário'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Data">
                <Input
                  type="date"
                  value={blockDraft.date}
                  onChange={(event) =>
                    setBlockDraft((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Início">
                <Input
                  type="time"
                  value={blockDraft.startTime}
                  onChange={(event) =>
                    setBlockDraft((prev) => ({
                      ...prev,
                      startTime: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Fim">
                <Input
                  type="time"
                  value={blockDraft.endTime}
                  onChange={(event) =>
                    setBlockDraft((prev) => ({
                      ...prev,
                      endTime: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Profissional">
                <NativeSelect
                  value={blockDraft.professionalProfileId}
                  onChange={(value) =>
                    setBlockDraft((prev) => ({
                      ...prev,
                      professionalProfileId: value,
                    }))
                  }
                >
                  <option value="">Todos / sem profissional</option>
                  {visibleProfessionals.map((member) => (
                    <option key={member.id} value={member.id}>
                      {professionalName(member)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Sala">
                <NativeSelect
                  value={blockDraft.roomId}
                  onChange={(value) =>
                    setBlockDraft((prev) => ({ ...prev, roomId: value }))
                  }
                >
                  <option value="">Todas / sem sala</option>
                  {activeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Field label="Motivo">
              <Input
                value={blockDraft.reason}
                onChange={(event) =>
                  setBlockDraft((prev) => ({
                    ...prev,
                    reason: event.target.value,
                  }))
                }
                placeholder="Ex: pausa, manutenção, reunião"
              />
            </Field>

            <label className="border-border bg-muted/30 flex items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={blockDraft.isOnlineBlock}
                onChange={(event) =>
                  setBlockDraft((prev) => ({
                    ...prev,
                    isOnlineBlock: event.target.checked,
                  }))
                }
                className="mt-1"
              />
              <span>
                <span className="text-foreground block font-medium">
                  Bloquear também a marcação online
                </span>
                <span className="text-muted-foreground text-xs">
                  Este bloqueio fica disponível para impedir horários no link
                  público quando a marcação online for ligada.
                </span>
              </span>
            </label>

            {editingBlockId ? (
              <AgendaEventList
                title="Histórico do bloqueio"
                events={blockEvents}
              />
            ) : null}
          </div>
          <DialogFooter>
            {editingBlockId ? (
              <Button
                variant="destructive"
                onClick={handleDeleteTimeBlock}
                disabled={savingBlock}
              >
                <Trash2 className="size-4" />
                Apagar
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setBlockOpen(false);
                setEditingBlockId(null);
                setBlockEvents([]);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveTimeBlock} disabled={savingBlock}>
              {savingBlock ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {editingBlockId ? 'Guardar bloqueio' : 'Bloquear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleChangeOpen} onOpenChange={setScheduleChangeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar alteração de horário</DialogTitle>
          </DialogHeader>
          {scheduleChangeDraft ? (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nova data">
                  <Input
                    type="date"
                    value={scheduleChangeDraft.date}
                    onChange={(event) =>
                      updateScheduleChangeTime({ date: event.target.value })
                    }
                  />
                </Field>
                <Field label="Novo horário">
                  <Input
                    type="time"
                    value={scheduleChangeDraft.time}
                    onChange={(event) =>
                      updateScheduleChangeTime({ time: event.target.value })
                    }
                  />
                </Field>
              </div>

              <Field label="Tipo de mudança">
                <NativeSelect
                  value={scheduleChangeDraft.type}
                  onChange={(value) =>
                    setScheduleChangeDraft((prev) =>
                      prev
                        ? { ...prev, type: value as ScheduleChangeType }
                        : prev
                    )
                  }
                >
                  {SCHEDULE_CHANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <div className="border-border bg-muted/30 rounded-md border p-3 text-xs">
                {
                  SCHEDULE_CHANGE_OPTIONS.find(
                    (item) => item.value === scheduleChangeDraft.type
                  )?.description
                }
              </div>

              {scheduleChangeBenefit?.status === 'reserved' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Voucher ou pack associado
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleChangeDraft((current) =>
                          current
                            ? { ...current, benefitDisposition: 'keep' }
                            : current
                        )
                      }
                      className={cn(
                        'rounded-md border p-3 text-left text-sm',
                        scheduleChangeDraft.benefitDisposition === 'keep'
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      <span className="block font-semibold">
                        Manter reservado
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Leva o benefício para o novo horário.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleChangeDraft((current) =>
                          current
                            ? { ...current, benefitDisposition: 'release' }
                            : current
                        )
                      }
                      className={cn(
                        'rounded-md border p-3 text-left text-sm',
                        scheduleChangeDraft.benefitDisposition === 'release'
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      <span className="block font-semibold">
                        Devolver ao saldo
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        Remove a reserva desta marcação.
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              <Field label="Motivo / observação">
                <Textarea
                  value={scheduleChangeDraft.reason}
                  onChange={(event) =>
                    setScheduleChangeDraft((prev) =>
                      prev ? { ...prev, reason: event.target.value } : prev
                    )
                  }
                  className="min-h-24"
                  placeholder="Ex: cliente pediu outro horário, ajuste de sala, cadastro estava errado..."
                />
              </Field>

              <label className="border-border bg-muted/30 flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleChangeDraft.requestClientConfirmation}
                  onChange={(event) =>
                    setScheduleChangeDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            requestClientConfirmation: event.target.checked,
                          }
                        : prev
                    )
                  }
                  className="mt-1"
                />
                <span>
                  <span className="text-foreground block font-medium">
                    Pedir confirmação do cliente pelo WhatsApp
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Se o cliente responder “CONFIRMAR”, a marcação fica
                    confirmada automaticamente. Se responder “REAGENDAR” ou
                    “NÃO”, fica sinalizada como não confirmada.
                  </span>
                </span>
              </label>

              {scheduleChangeDraft.requestClientConfirmation ? (
                <Field label="Mensagem para o cliente">
                  <Textarea
                    value={scheduleChangeDraft.confirmationMessage}
                    onChange={(event) =>
                      setScheduleChangeDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              confirmationMessage: event.target.value,
                            }
                          : prev
                      )
                    }
                    className="min-h-32"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setScheduleChangeOpen(false);
                setScheduleChangeDraft(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmScheduleChange}
              disabled={savingScheduleChange || !scheduleChangeDraft}
            >
              {savingScheduleChange ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarClock className="size-4" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appointmentOpen} onOpenChange={setAppointmentOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-border shrink-0 border-b px-5 py-4">
            <DialogTitle>Novo agendamento</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4">
            {appointmentReferralId ? (
              <div className="flex gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <HeartHandshake className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold">
                    Agendamento do Indique & Ganhe
                  </p>
                  <p className="text-muted-foreground text-xs">
                    O benefício configurado para o novo cliente será aplicado
                    automaticamente ao preço e seguirá para o POS.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente">
                <div className="flex gap-2">
                  <NativeSelect
                    value={appointmentDraft.contactId}
                    disabled={Boolean(appointmentReferralId)}
                    onChange={(value) =>
                      setAppointmentDraft((prev) => ({
                        ...prev,
                        contactId: value,
                      }))
                    }
                  >
                    <option value="">Selecione um cliente</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {appointmentContactLabel(contact)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setQuickContactOpen(true)}
                  >
                    Novo
                  </Button>
                </div>
              </Field>
              <Field label="Procedimento">
                <NativeSelect
                  value={appointmentDraft.serviceId}
                  onChange={(value) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      serviceId: value,
                    }))
                  }
                >
                  <option value="">Selecione um procedimento</option>
                  {activeServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.duration_minutes} min
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Data">
                <Input
                  type="date"
                  value={appointmentDraft.date}
                  onChange={(event) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Hora">
                <Input
                  type="time"
                  value={appointmentDraft.time}
                  onChange={(event) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      time: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Status">
                <NativeSelect
                  value={appointmentDraft.status}
                  onChange={(value) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      status: value as ClinicAppointmentStatus,
                    }))
                  }
                >
                  <option value="scheduled">Agendado</option>
                  <option value="confirmed">Confirmado</option>
                </NativeSelect>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Profissional">
                <NativeSelect
                  value={appointmentDraft.professionalProfileId}
                  onChange={(value) =>
                    setAppointmentDraft((prev) => ({
                      ...prev,
                      professionalProfileId: value,
                    }))
                  }
                >
                  <option value="">Sem profissional</option>
                  {visibleProfessionals.map((member) => (
                    <option key={member.id} value={member.id}>
                      {professionalName(member)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Sala">
                <NativeSelect
                  value={appointmentDraft.roomId}
                  onChange={(value) =>
                    setAppointmentDraft((prev) => ({ ...prev, roomId: value }))
                  }
                >
                  <option value="">Sem sala</option>
                  {activeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            {selectedService ? (
              <div className="border-border bg-muted/30 grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs">Duração</p>
                  <p className="text-foreground font-medium">
                    {selectedService.duration_minutes} minutos
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Preço</p>
                  <p className="text-foreground font-medium">
                    {formatCurrency(
                      Number(selectedService.price),
                      selectedService.currency || defaultCurrency
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Fim previsto</p>
                  <p className="text-foreground font-medium">
                    {timeInputValue(
                      addMinutes(
                        appointmentDate(
                          appointmentDraft.date,
                          appointmentDraft.time
                        ),
                        selectedService.duration_minutes
                      )
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="border-border rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Forma de pagamento</p>
                  <p className="text-muted-foreground text-xs">
                    Pode reservar um voucher ou uma sessão de pack agora.
                  </p>
                </div>
                {loadingBenefits ? (
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                ) : null}
              </div>
              <div className="mb-3 flex gap-2">
                <Input
                  value={newBenefitVoucherCode}
                  onChange={(event) => {
                    setNewBenefitVoucherCode(event.target.value.toUpperCase());
                    setNewBenefitCodeLookup(null);
                    setNewBenefitVoucherPin('');
                  }}
                  onBlur={() => {
                    if (newBenefitVoucherCode.trim()) {
                      void lookupNewBenefitCode();
                    }
                  }}
                  placeholder="Pesquisar voucher, cartão presente ou pack"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Pesquisar benefício"
                  disabled={lookingUpBenefit || !newBenefitVoucherCode.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void lookupNewBenefitCode()}
                >
                  {lookingUpBenefit ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
                <div className="bg-muted grid grid-cols-3 gap-1 rounded-md p-1">
                  {(
                    [
                      ['direct', 'Direto', CircleDollarSign],
                      ['voucher', 'Voucher', Gift],
                      ['pack', 'Pack', PackageCheck],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setNewBenefitType(value);
                        setNewBenefitSourceId('');
                        setNewBenefitCodeLookup(null);
                        if (value === 'direct') {
                          setNewBenefitVoucherCode('');
                          setNewBenefitVoucherPin('');
                        }
                      }}
                      className={cn(
                        'flex min-h-12 flex-col items-center justify-center gap-1 rounded px-2 text-xs font-medium',
                        newBenefitType === value
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground'
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  ))}
                </div>
                {newBenefitType === 'voucher' ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input
                      value={newBenefitVoucherCode}
                      readOnly={Boolean(newBenefitCodeLookup)}
                      onChange={(event) =>
                        setNewBenefitVoucherCode(
                          event.target.value.toUpperCase()
                        )
                      }
                      placeholder="Código do voucher"
                    />
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={newBenefitVoucherPin}
                      onChange={(event) =>
                        setNewBenefitVoucherPin(
                          event.target.value.replace(/\D/g, '').slice(0, 8)
                        )
                      }
                      placeholder="PIN"
                    />
                  </div>
                ) : newBenefitType === 'pack' && newBenefitCodeLookup ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input value={newBenefitCodeLookup.label} readOnly />
                    <Input
                      type="password"
                      inputMode="numeric"
                      value={newBenefitVoucherPin}
                      onChange={(event) =>
                        setNewBenefitVoucherPin(
                          event.target.value.replace(/\D/g, '').slice(0, 8)
                        )
                      }
                      placeholder="PIN"
                    />
                  </div>
                ) : newBenefitType === 'pack' ? (
                  <NativeSelect
                    value={newBenefitSourceId}
                    onChange={setNewBenefitSourceId}
                  >
                    <option value="">Selecione um pack compatível</option>
                    {availablePacks.map((clientPack) => {
                      const balance = clientPack.balances?.find(
                        (item) => item.service_id === appointmentDraft.serviceId
                      );
                      return (
                        <option key={clientPack.id} value={clientPack.id}>
                          {clientPack.pack?.name ?? 'Pack'} ·{' '}
                          {balance?.remaining_sessions ?? 0} sessões
                        </option>
                      );
                    })}
                  </NativeSelect>
                ) : (
                  <div className="bg-muted/40 text-muted-foreground flex min-h-10 items-center rounded-md px-3 text-xs">
                    O pagamento será registado normalmente no financeiro.
                  </div>
                )}
              </div>
            </div>

            <Field label="Observações">
              <Textarea
                value={appointmentDraft.notes}
                onChange={(event) =>
                  setAppointmentDraft((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Preferências, cuidados e observações do atendimento."
              />
            </Field>
          </div>

          <DialogFooter className="border-border shrink-0 border-t px-5 py-3">
            <Button variant="outline" onClick={() => setAppointmentOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateAppointment}
              disabled={savingAppointment || activeServices.length === 0}
            >
              {savingAppointment ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
              Criar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactForm
        open={quickContactOpen}
        onOpenChange={setQuickContactOpen}
        onSaved={() => {
          void loadAgenda();
        }}
      />
    </section>
  );
}

function DayCalendar({
  appointments,
  blocks,
  currency,
  selectedDate,
  onSelect,
  onMove,
  onSelectBlock,
  onCreateAt,
}: {
  appointments: AppointmentRow[];
  blocks: TimeBlockRow[];
  currency: string;
  selectedDate: Date;
  onSelect: (appointment: AppointmentRow) => void;
  onMove?: (appointmentId: string, targetStart: Date) => void;
  onSelectBlock: (block: TimeBlockRow) => void;
  onCreateAt?: (date: Date) => void;
}) {
  return (
    <CalendarTimeGrid
      days={[selectedDate]}
      appointments={appointments}
      blocks={blocks}
      currency={currency}
      onSelect={onSelect}
      onMove={onMove}
      onSelectBlock={onSelectBlock}
      onCreateAt={onCreateAt}
    />
  );
}

function WeekCalendar({
  start,
  appointments,
  blocks,
  currency,
  onSelect,
  onMove,
  onSelectBlock,
  onCreateAt,
}: {
  start: Date;
  appointments: AppointmentRow[];
  blocks: TimeBlockRow[];
  currency: string;
  onSelect: (appointment: AppointmentRow) => void;
  onMove?: (appointmentId: string, targetStart: Date) => void;
  onSelectBlock: (block: TimeBlockRow) => void;
  onCreateAt?: (date: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  return (
    <CalendarTimeGrid
      days={days}
      appointments={appointments}
      blocks={blocks}
      currency={currency}
      onSelect={onSelect}
      onMove={onMove}
      onSelectBlock={onSelectBlock}
      onCreateAt={onCreateAt}
    />
  );
}

function CalendarTimeGrid({
  days,
  appointments,
  blocks,
  currency,
  onSelect,
  onMove,
  onSelectBlock,
  onCreateAt,
}: {
  days: Date[];
  appointments: AppointmentRow[];
  blocks: TimeBlockRow[];
  currency: string;
  onSelect: (appointment: AppointmentRow) => void;
  onMove?: (appointmentId: string, targetStart: Date) => void;
  onSelectBlock: (block: TimeBlockRow) => void;
  onCreateAt?: (date: Date) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const gridHeight = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT;
  const minDayWidth =
    days.length === 1 ? 'minmax(680px,1fr)' : 'minmax(190px,1fr)';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="border-border bg-card max-h-[calc(100vh-260px)] overflow-auto rounded-lg border">
      <div
        className="min-w-[920px]"
        style={{
          display: 'grid',
          gridTemplateColumns: `64px repeat(${days.length}, ${minDayWidth})`,
        }}
      >
        <div className="bg-muted/95 border-border sticky top-0 left-0 z-30 border-r border-b px-2 py-2 text-xs font-semibold backdrop-blur">
          Hora
        </div>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="bg-muted/95 border-border sticky top-0 z-20 border-b px-3 py-2 text-sm font-semibold capitalize backdrop-blur"
          >
            {dayLabel(day)}
          </div>
        ))}

        <div
          className="border-border bg-card sticky left-0 z-10 border-r"
          style={{ height: gridHeight }}
        >
          {Array.from(
            { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
            (_, index) => CALENDAR_START_HOUR + index
          ).map((hour) => (
            <div
              key={hour}
              className="text-muted-foreground absolute right-2 -translate-y-2 text-xs"
              style={{ top: (hour - CALENDAR_START_HOUR) * HOUR_HEIGHT }}
            >
              {pad(hour)}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = addDays(dayStart, 1);
          const dayAppointments = appointments.filter((appointment) => {
            const time = new Date(appointment.scheduled_start).getTime();
            return time >= dayStart.getTime() && time < dayEnd.getTime();
          });
          const dayBlocks = blocks.filter((block) => {
            const time = new Date(block.starts_at).getTime();
            return time >= dayStart.getTime() && time < dayEnd.getTime();
          });
          const appointmentLayout = layoutAppointments(dayAppointments);
          const isToday =
            dayStart.getFullYear() === now.getFullYear() &&
            dayStart.getMonth() === now.getMonth() &&
            dayStart.getDate() === now.getDate();
          const currentMinute = now.getHours() * 60 + now.getMinutes();
          const currentTop =
            ((currentMinute - CALENDAR_START_HOUR * 60) / 60) * HOUR_HEIGHT;

          return (
            <div
              key={day.toISOString()}
              className="border-border relative border-r last:border-r-0"
              onDragOver={(event) => event.preventDefault()}
              onDoubleClick={(event) => {
                if (!onCreateAt || event.target !== event.currentTarget) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const y = Math.max(0, event.clientY - rect.top);
                const rawMinutes = (y / HOUR_HEIGHT) * 60;
                const minutesFromStart = Math.max(
                  0,
                  Math.min(
                    (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60 - 15,
                    snapMinutesToGrid(rawMinutes)
                  )
                );
                const targetStart = new Date(day);
                targetStart.setHours(
                  CALENDAR_START_HOUR + Math.floor(minutesFromStart / 60),
                  minutesFromStart % 60,
                  0,
                  0
                );
                onCreateAt(targetStart);
              }}
              onDrop={(event) => {
                if (!onMove) return;
                const appointmentId = event.dataTransfer.getData('text/plain');
                if (!appointmentId) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const y = Math.max(0, event.clientY - rect.top);
                const rawMinutes = Math.round((y / HOUR_HEIGHT) * 60);
                const minutesFromStart = Math.max(
                  0,
                  Math.min(
                    (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60 - 15,
                    snapMinutesToGrid(rawMinutes)
                  )
                );
                const targetStart = new Date(day);
                targetStart.setHours(
                  CALENDAR_START_HOUR + Math.floor(minutesFromStart / 60),
                  minutesFromStart % 60,
                  0,
                  0
                );
                onMove(appointmentId, targetStart);
              }}
              style={{
                height: gridHeight,
                backgroundImage:
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 20px, rgba(148, 163, 184, 0.22) 20px, rgba(148, 163, 184, 0.22) 21px, transparent 21px, transparent 84px)',
              }}
            >
              {isToday && currentTop >= 0 && currentTop <= gridHeight ? (
                <div
                  className="pointer-events-none absolute right-0 left-0 z-20 border-t-2 border-rose-500"
                  style={{ top: currentTop }}
                >
                  <span className="absolute -top-1.5 -left-1 size-3 rounded-full bg-rose-500" />
                </div>
              ) : null}
              {dayBlocks.map((block) => (
                <TimeBlockCard
                  key={block.id}
                  block={block}
                  onSelect={() => onSelectBlock(block)}
                />
              ))}
              {dayAppointments.map((appointment) => (
                <AppointmentBlock
                  key={appointment.id}
                  appointment={appointment}
                  currency={currency}
                  onSelect={() => onSelect(appointment)}
                  canMove={Boolean(onMove)}
                  layout={appointmentLayout.get(appointment.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentBlock({
  appointment,
  currency,
  onSelect,
  canMove,
  layout,
}: {
  appointment: AppointmentRow;
  currency: string;
  onSelect: () => void;
  canMove: boolean;
  layout?: { column: number; columns: number };
}) {
  const professionalColor =
    appointment.professional?.professional_color ||
    appointment.service?.color ||
    '#7c3aed';

  return (
    <button
      type="button"
      draggable={canMove}
      onDragStart={(event) => {
        if (!canMove) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', appointment.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onSelect}
      className={cn(
        'hover:ring-primary/40 absolute overflow-hidden rounded-md border p-2 text-left shadow-sm transition hover:z-30 hover:ring-2',
        appointment.status === 'cancelled'
          ? 'border-red-500/30 bg-red-500/15 text-red-950 dark:text-red-100'
          : appointment.status === 'no_show'
            ? 'border-amber-500/30 bg-amber-500/15 text-amber-950 dark:text-amber-100'
            : appointment.paid_at
              ? 'border-emerald-500/30 bg-emerald-500/20'
              : 'border-sky-500/30 bg-sky-500/20'
      )}
      style={{
        top: calendarTop(appointment.scheduled_start),
        height: calendarHeight(appointment),
        left: `calc(${((layout?.column ?? 0) / (layout?.columns ?? 1)) * 100}% + 4px)`,
        width: `calc(${100 / (layout?.columns ?? 1)}% - 8px)`,
        borderLeftWidth: 4,
        borderLeftColor: professionalColor,
      }}
    >
      <div className="flex items-start gap-1">
        {appointment.status === 'confirmed' || appointment.arrived_at ? (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
        ) : null}
        {appointment.paid_at ? (
          <CircleDollarSign className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">
            {appointmentContactLabel(appointment.contact)}
          </p>
          <p className="truncate text-[11px]">
            {appointment.service?.name ?? 'Procedimento'}
          </p>
          <p className="truncate text-[11px]">
            {appointmentRange(appointment)} ·{' '}
            {professionalName(appointment.professional)}
          </p>
          <p className="truncate text-[11px]">
            {appointment.room?.name ?? 'Sem sala'} ·{' '}
            {formatCurrency(
              Number(appointment.price ?? 0),
              appointment.currency || currency
            )}
          </p>
          <AppointmentBenefitBadge appointment={appointment} />
        </div>
      </div>
    </button>
  );
}

function AppointmentBenefitBadge({
  appointment,
}: {
  appointment: AppointmentRow;
}) {
  const benefit = appointment.benefits?.find((item) =>
    ['reserved', 'consumed'].includes(item.status)
  );
  const sale = appointment.sales?.find((item) =>
    ['paid', 'partially_paid', 'open'].includes(item.status)
  );
  const paymentMethods = Array.from(
    new Set(
      sale?.payments
        ?.filter((payment) => payment.status === 'confirmed')
        .map((payment) => paymentMethodLabel(payment.method)) ?? []
    )
  );
  if (!appointment.referral_id && !benefit && !sale && !appointment.paid_at)
    return null;
  return (
    <span className="mt-1 flex max-w-full flex-wrap gap-1">
      {appointment.referral_id ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <HeartHandshake className="size-3 shrink-0" />
          <span className="truncate">
            Indicação · -
            {formatCurrency(
              Number(appointment.referral_discount_amount ?? 0),
              appointment.currency || 'EUR'
            )}
          </span>
        </span>
      ) : null}
      {benefit?.benefit_type === 'pack' ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <PackageCheck className="size-3 shrink-0" />
          <span className="truncate">
            Pack {benefit.status === 'consumed' ? 'usado' : 'reservado'} ·{' '}
            {benefit.client_pack_balance?.remaining_sessions ?? 0}/
            {benefit.client_pack_balance?.total_sessions ?? 0}
          </span>
        </span>
      ) : benefit ? (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
          <Gift className="size-3" /> Voucher{' '}
          {benefit.status === 'consumed' ? 'usado' : 'reservado'}
        </span>
      ) : null}
      {sale ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
            sale.status === 'paid'
              ? 'bg-emerald-600 text-white'
              : sale.status === 'partially_paid'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-600 text-white'
          )}
        >
          <CircleDollarSign className="size-3" />
          {sale.status === 'paid'
            ? 'Pago'
            : sale.status === 'partially_paid'
              ? 'Parcial'
              : 'Pendente'}
          {paymentMethods.length ? ` · ${paymentMethods.join(' + ')}` : ''}
        </span>
      ) : appointment.paid_at && benefit ? (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <CircleDollarSign className="size-3" /> Pago com benefício
        </span>
      ) : null}
    </span>
  );
}

function paymentMethodLabel(method: string) {
  return (
    {
      cash: 'Dinheiro',
      card: 'Cartão',
      mb_way: 'MB Way',
      multibanco: 'Multibanco',
      bank_transfer: 'Transferência',
      voucher: 'Voucher',
      client_credit: 'Crédito',
      other: 'Outro',
    }[method] ?? method
  );
}

function TimeBlockCard({
  block,
  onSelect,
}: {
  block: TimeBlockRow;
  onSelect: () => void;
}) {
  const startsAt = new Date(block.starts_at);
  const endsAt = new Date(block.ends_at);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="absolute right-1 left-1 z-0 overflow-hidden rounded-md border border-slate-400/35 bg-slate-200/70 p-2 text-left text-slate-700 shadow-inner dark:bg-slate-800/70 dark:text-slate-200"
      style={{
        top: calendarTop(block.starts_at),
        height: calendarRangeHeight(block.starts_at, block.ends_at),
      }}
    >
      <div className="flex items-start gap-1.5">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">
            {block.reason?.trim() || 'Horário bloqueado'}
          </p>
          <p className="truncate text-[11px]">
            {timeInputValue(startsAt)}-{timeInputValue(endsAt)}
          </p>
          <p className="truncate text-[11px]">
            {block.professional
              ? professionalName(block.professional)
              : 'Todos os profissionais'}
          </p>
        </div>
      </div>
    </button>
  );
}

const AGENDA_EVENT_LABELS: Record<ClinicAgendaEventAction, string> = {
  created: 'Criado',
  updated: 'Atualizado',
  deleted: 'Apagado',
  rescheduled: 'Remarcado',
  schedule_changed: 'Horário alterado',
  wrong_booking_moved: 'Agendamento corrigido',
  status_changed: 'Status alterado',
  message_sent: 'Mensagem enviada',
};

function AgendaEventList({
  title,
  events,
  compact = false,
}: {
  title?: string;
  events: ClinicAgendaEvent[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        compact ? '' : 'border-border bg-muted/20 rounded-md border p-3'
      )}
    >
      {title ? (
        <div className="mb-2 flex items-center gap-2">
          <History className="text-primary size-4" />
          <p className="text-foreground text-sm font-semibold">{title}</p>
        </div>
      ) : null}
      {events.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nenhum evento registado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 6).map((event) => (
            <div
              key={event.id}
              className="bg-background rounded-md border px-2.5 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground font-medium">
                  {AGENDA_EVENT_LABELS[event.action] ?? event.action}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(event.created_at).toLocaleString('pt-PT', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {event.reason ? (
                <p className="text-muted-foreground mt-1 line-clamp-2">
                  {event.reason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentSection({
  value,
  icon,
  title,
  summary,
  children,
}: {
  value: string;
  icon: ReactNode;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <Accordion className="border-border bg-card rounded-md border">
      <AccordionItem value={value} className="border-0 px-3">
        <AccordionTrigger className="min-h-14 py-2.5 hover:no-underline">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
              {icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="text-muted-foreground block truncate text-xs font-normal">
                {summary}
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pt-1 pb-3">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function AppointmentDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[10px] font-medium uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}

function HeaderStatus({
  label,
  value,
  active = false,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        active
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-border bg-muted/30'
      )}
    >
      <p className="text-muted-foreground text-[10px] font-medium uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function ActionButton({
  active,
  danger,
  tone = 'neutral',
  onClick,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  tone?: 'neutral' | 'emerald' | 'sky' | 'amber' | 'violet';
  onClick: () => void;
  children: ReactNode;
}) {
  const toneClass = {
    neutral: 'border-border bg-background text-foreground hover:bg-muted',
    emerald:
      'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200',
    sky: 'border-sky-500/35 bg-sky-500/10 text-sky-800 hover:bg-sky-500/20 dark:text-sky-200',
    amber:
      'border-amber-500/35 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200',
    violet:
      'border-violet-500/35 bg-violet-500/10 text-violet-800 hover:bg-violet-500/20 dark:text-violet-200',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
        active
          ? danger
            ? 'border-red-500 bg-red-500 text-white'
            : tone === 'emerald'
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : tone === 'sky'
                ? 'border-sky-600 bg-sky-600 text-white'
                : tone === 'amber'
                  ? 'border-amber-500 bg-amber-500 text-amber-950'
                  : tone === 'violet'
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-primary bg-primary text-primary-foreground'
          : danger
            ? 'border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300'
            : toneClass
      )}
    >
      {children}
    </button>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bg-muted inline-flex w-fit rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded-md px-3 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-md px-3 py-2">
      <p>{label}</p>
      <p className="text-foreground truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function AgendaBenefitStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
  detail: string;
  tone: 'amber' | 'violet' | 'emerald' | 'sky';
}) {
  const colors = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  }[tone];
  return (
    <div className="bg-muted/25 flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          colors
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{value}</span>
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="text-muted-foreground truncate text-[11px]">{detail}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-foreground font-medium">{label}</span>
      {children}
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}

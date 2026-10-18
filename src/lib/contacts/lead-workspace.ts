import type { Contact } from '@/types';
import type { BenefitReservation } from '@/lib/inbox/available-benefits';

type LeadPageQuery = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
};
/** The MySQL API caps each request at 1,000 rows. Fetch explicit pages to avoid silently incomplete segments. */
export async function readLeadPages(
  query: () => LeadPageQuery,
  maximum: number,
  isCurrent: () => boolean
) {
  const data: unknown[] = [];
  while (data.length < maximum && isCurrent()) {
    const size = Math.min(1000, maximum - data.length);
    const result = await query().range(data.length, data.length + size - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    data.push(...page);
    if (page.length < size) break;
  }
  return { data };
}

export type LeadVoucher = {
  id: string;
  owner_contact_id: string | null;
  status: string;
  expires_at: string | null;
  remaining_uses?: number | null;
  current_balance?: number | null;
  voucher_type?: string | null;
};
export type LeadPack = {
  contact_id: string | null;
  status: string;
  expires_at: string | null;
  balances?: { id: string; remaining_sessions: number }[];
};
export type LeadAppointment = {
  contact_id: string | null;
  scheduled_start: string;
  status: string;
};
export type LeadFilter =
  | 'all'
  | 'expiring'
  | 'no_appointment'
  | 'new'
  | 'marketing_ready'
  | 'upcoming';
export type LeadSort = 'priority' | 'recent' | 'name';
export type LeadRow = {
  contact: Contact;
  benefits: number;
  expiring?: number;
  nextAppointment?: string;
  ready: boolean;
  isNew: boolean;
  priority: number;
};
const DAY = 86_400_000;
/** MySQL timestamps are UTC even when the transport omits the suffix. */
export function leadTimestamp(value: string) {
  return new Date(
    /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value
  ).getTime();
}
export function buildLeadRows(
  contacts: Contact[],
  vouchers: LeadVoucher[],
  packs: LeadPack[],
  appointments: LeadAppointment[],
  reservations: BenefitReservation[],
  now: number
): LeadRow[] {
  const held = new Map<string, { uses: number; amount: number }>();
  for (const reservation of reservations) {
    if (reservation.status !== 'reserved') continue;
    const key = reservation.voucher_id || reservation.client_pack_balance_id;
    if (!key) continue;
    const previous = held.get(key) || { uses: 0, amount: 0 };
    previous.uses += reservation.voucher_id
      ? 1
      : Number(reservation.reserved_sessions || 0);
    previous.amount += Number(reservation.reserved_amount || 0);
    held.set(key, previous);
  }
  const benefits = new Map<string, { count: number; expiring?: number }>();
  function addBenefit(
    contactId: string | null,
    status: string,
    expires: string | null,
    available: boolean
  ) {
    if (!contactId || status !== 'active' || !available) return;
    const expiry = expires ? leadTimestamp(expires) : Infinity;
    if (!(expiry > now)) return;
    const days = Math.ceil((expiry - now) / DAY);
    const entry = benefits.get(contactId) || { count: 0 };
    entry.count++;
    if (days <= 30) entry.expiring = Math.min(entry.expiring ?? Infinity, days);
    benefits.set(contactId, entry);
  }
  for (const voucher of vouchers) {
    const reserved = held.get(voucher.id);
    const free =
      voucher.voucher_type === 'service'
        ? Number(voucher.remaining_uses || 0) - (reserved?.uses || 0)
        : Number(voucher.current_balance || 0) - (reserved?.amount || 0);
    addBenefit(
      voucher.owner_contact_id,
      voucher.status,
      voucher.expires_at,
      free > 0
    );
  }
  for (const pack of packs)
    addBenefit(
      pack.contact_id,
      pack.status,
      pack.expires_at,
      (pack.balances || []).some(
        (balance) =>
          Number(balance.remaining_sessions) -
            (held.get(balance.id)?.uses || 0) >
          0
      )
    );
  const nextAppointments = new Map<string, string>();
  for (const appointment of appointments) {
    if (
      !appointment.contact_id ||
      !['scheduled', 'confirmed'].includes(appointment.status) ||
      leadTimestamp(appointment.scheduled_start) < now ||
      !Number.isFinite(leadTimestamp(appointment.scheduled_start))
    )
      continue;
    const current = nextAppointments.get(appointment.contact_id);
    if (
      !current ||
      leadTimestamp(appointment.scheduled_start) < leadTimestamp(current)
    )
      nextAppointments.set(appointment.contact_id, appointment.scheduled_start);
  }
  return contacts.map((contact) => {
    const benefit = benefits.get(contact.id);
    const nextAppointment = nextAppointments.get(contact.id);
    const age = now - leadTimestamp(contact.created_at);
    const isNew = age >= 0 && age <= 30 * DAY;
    return {
      contact,
      benefits: benefit?.count || 0,
      expiring: benefit?.expiring,
      nextAppointment,
      ready: Boolean(
        contact.phone?.trim() &&
        contact.marketing_whatsapp_consent &&
        contact.privacy_review_status === 'current'
      ),
      isNew,
      priority: nextAppointment
        ? 4
        : benefit?.expiring !== undefined
          ? 0
          : benefit?.count
            ? 1
            : isNew
              ? 2
              : 3,
    };
  });
}
export function normalizeLeadSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .trim();
}
export function filterLeadRows(
  rows: LeadRow[],
  filter: LeadFilter,
  query: string,
  gender: string,
  sort: LeadSort
) {
  const term = normalizeLeadSearch(query);
  const phoneTerm = term.replace(/\D/g, '');
  return rows
    .filter((row) => {
      const c = row.contact;
      if (
        gender !== 'all' &&
        c.gender !== gender &&
        !(gender === 'not_informed' && !c.gender)
      )
        return false;
      const text = normalizeLeadSearch(
        [c.name, c.phone, c.email, c.company, c.client_reference]
          .filter(Boolean)
          .join(' ')
      );
      const phoneMatch =
        /^[+\d\s().-]+$/.test(term) &&
        phoneTerm.length > 0 &&
        c.phone?.replace(/\D/g, '').includes(phoneTerm);
      if (term && !text.includes(term) && !phoneMatch) return false;
      if (filter === 'expiring')
        return row.expiring !== undefined && !row.nextAppointment;
      if (filter === 'no_appointment') return !row.nextAppointment;
      if (filter === 'new') return row.isNew;
      if (filter === 'marketing_ready') return row.ready;
      if (filter === 'upcoming') return Boolean(row.nextAppointment);
      return true;
    })
    .sort((a, b) => {
      if (sort === 'name')
        return (a.contact.name || a.contact.phone || '').localeCompare(
          b.contact.name || b.contact.phone || '',
          'pt-PT'
        );
      if (sort === 'priority') {
        const priority =
          a.priority - b.priority ||
          (a.expiring ?? Infinity) - (b.expiring ?? Infinity);
        if (priority) return priority;
      }
      return (
        (leadTimestamp(b.contact.created_at) || 0) -
          (leadTimestamp(a.contact.created_at) || 0) ||
        a.contact.id.localeCompare(b.contact.id)
      );
    });
}

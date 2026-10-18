import { describe, expect, it } from 'vitest';
import {
  buildLeadRows,
  filterLeadRows,
  leadTimestamp,
  readLeadPages,
  type LeadVoucher,
} from './lead-workspace';
import type { Contact } from '@/types';

const now = Date.parse('2026-10-18T12:00:00Z');
const contact = (id: string, extra: Partial<Contact> = {}) =>
  ({
    id,
    name: id,
    phone: '+351 910 000 001',
    created_at: '2026-10-01T12:00:00Z',
    ...extra,
  }) as Contact;
const voucher = (extra: Partial<LeadVoucher> = {}): LeadVoucher => ({
  id: 'v',
  owner_contact_id: 'a',
  status: 'active',
  expires_at: '2026-10-20T12:00:00Z',
  voucher_type: 'service',
  remaining_uses: 1,
  ...extra,
});

describe('Lead work queue', () => {
  it('shows completed sessions with calendar days in the account timezone, including DST changes', () => {
    const rows = buildLeadRows(
      [contact('a')],
      [],
      [],
      [],
      [],
      Date.parse('2026-10-26T00:10:00Z'),
      [
        {
          contact_id: 'a',
          last_session: '2026-10-24T23:30:00Z',
          total_sessions: 4,
        },
      ],
      'Europe/Lisbon'
    );
    expect(rows[0].daysSinceSession).toBe(1);
    expect(rows[0].totalSessions).toBe(4);
    expect(rows[0].lastSession).toBe('2026-10-24T23:30:00Z');
  });
  it('filters by time since a completed session and separates never-attended contacts', () => {
    const rows = buildLeadRows(
      [contact('a'), contact('b'), contact('c')],
      [],
      [],
      [],
      [],
      now,
      [
        {
          contact_id: 'a',
          last_session: '2026-07-01T12:00:00Z',
          total_sessions: 2,
        },
        {
          contact_id: 'b',
          last_session: '2026-10-18T08:00:00Z',
          total_sessions: 1,
        },
      ]
    );
    expect(rows[0].daysSinceSession).toBe(109);
    expect(rows[1].daysSinceSession).toBe(0);
    expect(rows[2].daysSinceSession).toBeUndefined();
    expect(
      filterLeadRows(rows, 'all', '', 'all', 'inactive').map(
        (row) => row.contact.id
      )
    ).toEqual(['a', 'b', 'c']);
    expect(
      filterLeadRows(rows, 'all', '', 'all', 'priority', '90').map(
        (row) => row.contact.id
      )
    ).toEqual(['a']);
    expect(
      filterLeadRows(rows, 'all', '', 'all', 'priority', 'never').map(
        (row) => row.contact.id
      )
    ).toEqual(['c']);
  });
  it('loads beyond the API page cap without silently cutting the dataset', async () => {
    const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const ranges: number[][] = [];
    const result = await readLeadPages(
      () => ({
        range: async (from, to) => {
          ranges.push([from, to]);
          return { data: source.slice(from, to + 1), error: null };
        },
      }),
      2001,
      () => true
    );
    expect(result.data).toHaveLength(1201);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
  it('fails the snapshot when a dependency fails and stops obsolete requests', async () => {
    await expect(
      readLeadPages(
        () => ({
          range: async () => ({
            data: null,
            error: { message: 'unavailable' },
          }),
        }),
        5001,
        () => true
      )
    ).rejects.toThrow('unavailable');
    let called = false;
    await readLeadPages(
      () => ({
        range: async () => {
          called = true;
          return { data: [], error: null };
        },
      }),
      5001,
      () => false
    );
    expect(called).toBe(false);
  });
  it('ignores exhausted, expired, cancelled and completely reserved vouchers', () => {
    const rows = buildLeadRows(
      [contact('a')],
      [
        voucher({ remaining_uses: 0 }),
        voucher({ id: 'expired', expires_at: '2026-10-18T12:00:00Z' }),
        voucher({ id: 'cancelled', status: 'cancelled' }),
        voucher({ id: 'held' }),
      ],
      [],
      [],
      [{ voucher_id: 'held', status: 'reserved' }],
      now
    );
    expect(rows[0].benefits).toBe(0);
    expect(rows[0].expiring).toBeUndefined();
  });
  it('deducts reserved voucher value and pack sessions while ignoring released reservations', () => {
    const rows = buildLeadRows(
      [contact('a')],
      [voucher({ voucher_type: 'value', current_balance: 50 })],
      [
        {
          contact_id: 'a',
          status: 'active',
          expires_at: null,
          balances: [{ id: 'b', remaining_sessions: 2 }],
        },
      ],
      [],
      [
        { voucher_id: 'v', reserved_amount: 50, status: 'reserved' },
        {
          client_pack_balance_id: 'b',
          reserved_sessions: 1,
          status: 'reserved',
        },
        {
          client_pack_balance_id: 'b',
          reserved_sessions: 1,
          status: 'released',
        },
      ],
      now
    );
    expect(rows[0].benefits).toBe(1);
    expect(rows[0].expiring).toBeUndefined();
    expect(
      buildLeadRows(
        [contact('a')],
        [],
        [
          {
            contact_id: 'a',
            status: 'active',
            expires_at: null,
            balances: [{ id: 'b', remaining_sessions: 1 }],
          },
        ],
        [],
        [
          {
            client_pack_balance_id: 'b',
            reserved_sessions: 1,
            status: 'reserved',
          },
        ],
        now
      )[0].benefits
    ).toBe(0);
  });
  it('keeps the earliest future scheduled or confirmed appointment', () => {
    const appointments = [
      'cancelled',
      'completed',
      'no_show',
      'confirmed',
      'scheduled',
    ].map((status, i) => ({
      contact_id: 'a',
      status,
      scheduled_start: `2026-10-${19 + i}T16:00:00Z`,
    }));
    appointments.push({
      contact_id: 'a',
      status: 'scheduled',
      scheduled_start: '2026-10-10T16:00:00Z',
    });
    expect(
      buildLeadRows([contact('a')], [], [], appointments, [], now)[0]
        .nextAppointment
    ).toBe('2026-10-22T16:00:00Z');
  });
  it('prioritises expiring unused benefits without an upcoming appointment', () => {
    const rows = buildLeadRows(
      [contact('booked'), contact('new'), contact('a')],
      [voucher(), voucher({ id: 'other', owner_contact_id: 'booked' })],
      [],
      [
        {
          contact_id: 'booked',
          status: 'confirmed',
          scheduled_start: '2026-10-19T16:00:00Z',
        },
      ],
      [],
      now
    );
    expect(
      filterLeadRows(rows, 'all', '', 'all', 'priority').map(
        (row) => row.contact.id
      )
    ).toEqual(['a', 'new', 'booked']);
    expect(
      filterLeadRows(rows, 'expiring', '', 'all', 'priority').map(
        (row) => row.contact.id
      )
    ).toEqual(['a']);
    expect(rows.find((row) => row.contact.id === 'a')?.expiring).toBe(2);
  });
  it('requires phone and current WhatsApp marketing authorisation', () => {
    const rows = buildLeadRows(
      [
        contact('yes', {
          marketing_whatsapp_consent: true,
          privacy_review_status: 'current',
        }),
        contact('withdrawn', {
          marketing_whatsapp_consent: true,
          privacy_review_status: 'withdrawn',
        }),
        contact('none'),
        contact('no-phone', {
          phone: '',
          marketing_whatsapp_consent: true,
          privacy_review_status: 'current',
        }),
      ],
      [],
      [],
      [],
      [],
      now
    );
    expect(
      filterLeadRows(rows, 'marketing_ready', '', 'all', 'name').map(
        (row) => row.contact.id
      )
    ).toEqual(['yes']);
  });
  it('searches accents, formatted phone and client references with combined filters', () => {
    const rows = buildLeadRows(
      [
        contact('a', {
          name: 'Gonçalo Patrício',
          client_reference: '678',
          gender: 'male',
        }),
        contact('b', { name: 'Ana', gender: null }),
      ],
      [],
      [],
      [],
      [],
      now
    );
    expect(
      filterLeadRows(rows, 'all', 'goncalo patricio', 'male', 'name')
    ).toHaveLength(1);
    expect(
      filterLeadRows(rows, 'all', 'goncalo', 'female', 'name')
    ).toHaveLength(0);
    expect(
      filterLeadRows(rows, 'all', '910000001', 'all', 'name')
    ).toHaveLength(2);
    expect(filterLeadRows(rows, 'all', '678', 'all', 'name')).toHaveLength(1);
    expect(
      filterLeadRows(rows, 'all', '', 'not_informed', 'name')[0].contact.id
    ).toBe('b');
  });
  it('interprets timezone-less MySQL dates as UTC and excludes future or invalid creation dates from new contacts', () => {
    expect(leadTimestamp('2026-10-18 12:00:00')).toBe(now);
    const rows = buildLeadRows(
      [
        contact('old', { created_at: '2025-01-01' }),
        contact('future', { created_at: '2027-01-01' }),
        contact('invalid', { created_at: 'invalid' }),
        contact('new'),
      ],
      [],
      [],
      [],
      [],
      now
    );
    expect(
      filterLeadRows(rows, 'new', '', 'all', 'recent').map(
        (row) => row.contact.id
      )
    ).toEqual(['new']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAD_SETTINGS,
  parseLeadSettings,
  renderLeadMessage,
  suggestedLeadMessage,
  matchesLeadWork,
  type LeadFollowup,
} from './lead-workflow';
import { buildLeadRows } from './lead-workspace';
import type { Contact } from '@/types';
const now = Date.parse('2026-10-19T12:00:00Z');
const row = buildLeadRows(
  [
    {
      id: 'contact',
      name: 'João Silva',
      phone: '+351000000000',
      created_at: '2026-01-01',
    } as Contact,
  ],
  [],
  [],
  [],
  [],
  now,
  [
    {
      contact_id: 'contact',
      last_session: '2026-07-01T12:00:00Z',
      total_sessions: 3,
    },
  ]
)[0];
const item: LeadFollowup = {
  contact_id: 'contact',
  status: 'contacted',
  next_followup_at: '2026-10-18T10:00:00Z',
  last_contacted_at: '2026-10-15T10:00:00Z',
  notes: 'Pediu novo contacto.',
};
describe('Lead treatment', () => {
  it('validates saved settings and rejects unsupported variables, blank messages and invalid thresholds', () => {
    expect(parseLeadSettings(DEFAULT_LEAD_SETTINGS)).toEqual(
      DEFAULT_LEAD_SETTINGS
    );
    expect(
      parseLeadSettings({ ...DEFAULT_LEAD_SETTINGS, recoveryDays: 0 })
    ).toBeNull();
    expect(
      parseLeadSettings({ ...DEFAULT_LEAD_SETTINGS, followupDays: 1.5 })
    ).toBeNull();
    expect(
      parseLeadSettings({
        ...DEFAULT_LEAD_SETTINGS,
        templates: {
          ...DEFAULT_LEAD_SETTINGS.templates,
          recovery: '{desconto_inventado}',
        },
      })
    ).toBeNull();
    expect(
      parseLeadSettings({
        ...DEFAULT_LEAD_SETTINGS,
        templates: { ...DEFAULT_LEAD_SETTINGS.templates, first_contact: ' ' },
      })
    ).toBeNull();
  });
  it('personalises prepared text without inventing contact or benefit data', () => {
    expect(
      renderLeadMessage(
        'Olá {primeiro_nome}, {nome}! {empresa} · {dias_sem_sessao}',
        row,
        'Clínica de teste',
        'Europe/Lisbon'
      )
    ).toBe('Olá João, João Silva! Clínica de teste · 110');
    expect(
      renderLeadMessage('{dias_validade}', row, 'Clínica', 'Europe/Lisbon')
    ).toBe('sem prazo identificado');
    expect(suggestedLeadMessage(row)).toBe('recovery');
    expect(suggestedLeadMessage({ ...row, expiring: 5 })).toBe('benefit');
    expect(suggestedLeadMessage(row, item)).toBe('follow_up');
    expect(suggestedLeadMessage({ ...row, totalSessions: 0 })).toBe(
      'first_contact'
    );
  });
  it('keeps terminal or already-booked leads out of recovery and due queues', () => {
    expect(
      matchesLeadWork(row, undefined, 'recover', DEFAULT_LEAD_SETTINGS, now)
    ).toBe(true);
    expect(matchesLeadWork(row, item, 'due', DEFAULT_LEAD_SETTINGS, now)).toBe(
      true
    );
    expect(
      matchesLeadWork(
        row,
        { ...item, next_followup_at: '2026-10-25T12:00:00Z' },
        'recover',
        DEFAULT_LEAD_SETTINGS,
        now
      )
    ).toBe(false);
    expect(
      matchesLeadWork(
        { ...row, nextAppointment: '2026-10-20T12:00:00Z' },
        item,
        'due',
        DEFAULT_LEAD_SETTINGS,
        now
      )
    ).toBe(false);
    expect(
      matchesLeadWork(
        row,
        { ...item, status: 'not_interested' },
        'due',
        DEFAULT_LEAD_SETTINGS,
        now
      )
    ).toBe(false);
    expect(
      matchesLeadWork(
        { ...row, nextAppointment: '2026-10-20T12:00:00Z' },
        item,
        'recover',
        DEFAULT_LEAD_SETTINGS,
        now
      )
    ).toBe(false);
    expect(
      matchesLeadWork(row, undefined, 'new', DEFAULT_LEAD_SETTINGS, now)
    ).toBe(true);
    expect(
      matchesLeadWork(row, item, 'interested', DEFAULT_LEAD_SETTINGS, now)
    ).toBe(false);
    expect(
      matchesLeadWork(
        row,
        item,
        'recover',
        { ...DEFAULT_LEAD_SETTINGS, recoveryDays: 180 },
        now
      )
    ).toBe(false);
  });
});

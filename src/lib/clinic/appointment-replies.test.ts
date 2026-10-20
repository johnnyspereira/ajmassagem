import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  transaction: mocks.transaction,
}));
vi.mock('@/lib/notifications/account-events', () => ({
  notifyAccountEvent: vi.fn().mockResolvedValue(undefined),
}));
import { classifyAppointmentConfirmationReply } from './appointment-confirmation';
import { handleWhatsAppRescheduleReply } from './appointment-whatsapp-reschedule';
const input = {
  accountId: 'account',
  contactId: 'contact',
  conversationId: 'conversation',
  sourceMessageId: 'message',
  messageText: 'CANCELAR',
};
beforeEach(() => {
  mocks.select.mockResolvedValue([
    {
      id: 'appointment',
      scheduled_start: new Date('2026-12-01T12:00:00Z'),
      scheduled_end: new Date('2026-12-01T13:00:00Z'),
    },
  ]);
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT') ? [[{ id: 'appointment' }]] : [{ affectedRows: 1 }]
  );
  mocks.transaction.mockImplementation((work) =>
    work({ execute: mocks.execute })
  );
});
describe('Appointment reply commands', () => {
  function optionsFixture(conflict = false, stale = false) {
    const oldStart = new Date('2098-12-01T12:00:00Z'),
      oldEnd = new Date('2098-12-01T13:00:00Z');
    const options = [
      {
        startsAt: '2098-12-02T12:00:00Z',
        endsAt: '2098-12-02T13:00:00Z',
        label: '',
      },
    ];
    const meta = {
      kind: 'whatsapp_reschedule',
      state: 'options_sent',
      options,
    };
    mocks.select.mockResolvedValue([
      {
        id: 'event',
        entity_id: 'appointment',
        created_at: new Date(),
        old_starts_at: oldStart,
        old_ends_at: oldEnd,
        metadata: meta,
      },
    ]);
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM clinic_appointments'))
        return [
          [
            {
              id: 'appointment',
              scheduled_start: stale
                ? new Date('2098-12-01T14:00:00Z')
                : oldStart,
              scheduled_end: oldEnd,
              professional_profile_id: 'professional',
              room_id: null,
            },
          ],
        ];
      if (sql.startsWith('SELECT metadata')) return [[{ metadata: meta }]];
      if (sql.startsWith('SELECT id,scheduled_start'))
        return [
          conflict
            ? [
                {
                  id: 'other',
                  scheduled_start: new Date(options[0].startsAt),
                  scheduled_end: new Date(options[0].endsAt),
                  professional_profile_id: 'professional',
                  room_id: null,
                },
              ]
            : [],
        ];
      return sql.startsWith('SELECT') ? [[]] : [{ affectedRows: 1 }];
    });
  }
  it('applies a client-selected slot and resets reminder markers without financial changes', async () => {
    optionsFixture();
    const result = await handleWhatsAppRescheduleReply({
      ...input,
      messageText: '1',
    });
    expect(result?.replyText).toContain('reagendada e confirmada');
    const update = mocks.execute.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE clinic_appointments SET scheduled_start')
    );
    expect(update?.[1].slice(2)).toEqual(['appointment', 'account', 'contact']);
    expect(update?.[0]).toContain('reminder_sent_at=NULL');
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        /UPDATE finance_|DELETE/.test(sql)
      )
    ).toBe(false);
  });
  it.each([
    ['a new conflict', true, false],
    ['a manually changed appointment', false, true],
  ])('does not reschedule after %s', async (_label, conflict, stale) => {
    optionsFixture(Boolean(conflict), Boolean(stale));
    const result = await handleWhatsAppRescheduleReply({
      ...input,
      messageText: '1',
    });
    expect(result?.replyText).toContain('não foi alterada');
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE clinic_appointments SET scheduled_start')
      )
    ).toBe(false);
  });
  it.each(['CONFIRMAR', 'confirmar!', 'Quero confirmar', 'Confirmo'])(
    'recognizes confirmation %s',
    (text) => {
      expect(classifyAppointmentConfirmationReply(text)).toBe('confirmed');
    }
  );
  it.each(['Não quero confirmar', 'Não está confirmado?', 'Como confirmar?'])(
    'does not confirm a negation or question: %s',
    (text) => {
      expect(classifyAppointmentConfirmationReply(text)).not.toBe('confirmed');
    }
  );
  it('cancels only the linked appointment and releases reserved benefits without refunding payments', async () => {
    const result = await handleWhatsAppRescheduleReply(input);
    expect(result?.replyText).toContain('cancelada');
    expect(
      mocks.execute.mock.calls.some(
        ([sql, args]) =>
          sql.includes("status='cancelled'") &&
          args.join(',') === 'appointment,account,contact'
      )
    ).toBe(true);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.includes("status='released'")
      )
    ).toBe(true);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        /UPDATE finance_payments|DELETE/.test(sql)
      )
    ).toBe(false);
  });
  it.each([
    'Não quero cancelar',
    'Como cancelar?',
    'Se eu cancelar',
    'Não quero reagendar',
  ])(
    'does not change appointments for ambiguous text: %s',
    async (messageText) => {
      expect(
        await handleWhatsAppRescheduleReply({ ...input, messageText })
      ).toBeNull();
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );
  it('does not guess which of two appointments should be cancelled', async () => {
    mocks.select.mockResolvedValue([{ id: 'one' }, { id: 'two' }]);
    expect(await handleWhatsAppRescheduleReply(input)).toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

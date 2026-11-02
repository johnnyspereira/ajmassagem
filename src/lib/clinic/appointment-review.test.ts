import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const send = vi.hoisted(() => vi.fn());
vi.mock('@/lib/automations/meta-send', () => ({ engineSendText: send }));
vi.mock('@/lib/public-url', () => ({
  getPublicUrl: (path: string) => 'https://crm.test' + path,
}));
import { sendAppointmentReviewRequest } from './appointment-review';
type Result = { data: unknown; error: unknown };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  limit: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<Result>;
  insert: (values: unknown) => Query;
  update: (values: unknown) => Query;
  then: Promise<Result>['then'];
};
function fixture(
  settings: object = {},
  options: {
    sent?: boolean;
    settingsError?: boolean;
    missingPlaceholder?: boolean;
  } = {}
) {
  const writes: Array<{ table: string; kind: string; value: unknown }> = [],
    scopes: unknown[][] = [];
  const db = {
    from(table: string) {
      let kind = 'select';
      const result = (): Result => {
        if (kind !== 'select') return { data: null, error: null };
        if (table === 'clinic_appointments')
          return {
            data: {
              id: 'appointment',
              account_id: 'own',
              contact_id: 'client',
              user_id: 'owner',
              contact: { name: 'Pessoa Teste', phone: '+351000000000' },
              service: { name: 'Serviço de teste' },
              account: { name: 'Empresa de teste' },
            },
            error: null,
          };
        if (table === 'clinic_communication_settings')
          return {
            data: {
              ...settings,
              ...(options.missingPlaceholder
                ? {
                    automated_message_templates: {
                      review_request: 'Texto sem ligação',
                    },
                  }
                : {}),
            },
            error: options.settingsError ? { message: 'failed' } : null,
          };
        if (table === 'clinic_appointment_reviews')
          return {
            data: {
              public_token: 'personal-token',
              sent_at: options.sent ? '2026-11-01T12:00:00Z' : null,
            },
            error: null,
          };
        return { data: { id: 'conversation' }, error: null };
      };
      const query: Query = {
        select: () => query,
        eq: (...args) => {
          scopes.push([table, ...args]);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve(result()),
        insert: (value) => {
          kind = 'insert';
          writes.push({ table, kind, value });
          return query;
        },
        update: (value) => {
          kind = 'update';
          writes.push({ table, kind, value });
          return query;
        },
        then: (resolve, reject) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, writes, scopes };
}
beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({});
});
it('sends the personal system link and records the actual destination', async () => {
  const { db, writes, scopes } = fixture();
  const result = await sendAppointmentReviewRequest(
    db,
    'appointment',
    'https://crm.test'
  );
  expect(result).toMatchObject({
    sent: true,
    mode: 'system',
    url: 'https://crm.test/avaliar/personal-token',
  });
  expect(send.mock.calls[0][0].text).toContain(
    'https://crm.test/avaliar/personal-token'
  );
  expect(writes[0].value).toMatchObject({
    sent_link_mode: 'system',
    sent_link_url: result.url,
  });
  expect(scopes).toContainEqual([
    'clinic_appointment_reviews',
    'account_id',
    'own',
  ]);
});
it('sends the configured external link instead of the internal token', async () => {
  const { db, writes } = fixture({
    review_link_mode: 'google',
    review_google_url: 'https://example.test/review',
  });
  await sendAppointmentReviewRequest(db, 'appointment', 'https://crm.test');
  const text = send.mock.calls[0][0].text;
  expect(text).toContain('https://example.test/review');
  expect(text).not.toContain('/avaliar/');
  expect(writes[0].value).toMatchObject({
    sent_link_mode: 'google',
    sent_link_url: 'https://example.test/review',
  });
});
it('does not resend an already requested review when the destination changes', async () => {
  const { db, writes } = fixture(
    {
      review_link_mode: 'google',
      review_google_url: 'https://example.test/new',
    },
    { sent: true }
  );
  expect(
    await sendAppointmentReviewRequest(db, 'appointment', 'https://crm.test')
  ).toEqual({ skipped: true });
  expect(send).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});
it.each([{ settingsError: true }, { missingPlaceholder: true }])(
  'stops before sending when configuration is unavailable or the template lacks its variable: %j',
  async (options) => {
    const { db } = fixture({}, options);
    await expect(
      sendAppointmentReviewRequest(db, 'appointment', 'https://crm.test')
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  }
);
it('does not mark a request as sent if the transport fails', async () => {
  const { db, writes } = fixture();
  send.mockRejectedValueOnce(Error('offline'));
  await expect(
    sendAppointmentReviewRequest(db, 'appointment', 'https://crm.test')
  ).rejects.toThrow('offline');
  expect(writes).toEqual([]);
});
it('blocks a misconfigured external link before any transport call',async()=>{
  const {db}=fixture({review_link_mode:'google',review_google_url:'javascript:alert(1)'});
  await expect(sendAppointmentReviewRequest(db,'appointment','https://crm.test')).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});

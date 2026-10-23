import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  mutate: vi.fn(),
  send: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  mutate: mocks.mutate,
  transaction: mocks.transaction,
}));
vi.mock('@/lib/automations/meta-send', () => ({ engineSendText: mocks.send }));
vi.mock('@/lib/finance/sumup', () => ({
  getSumUpCredentials: () => ({ merchantCode: 'test' }),
}));
import {
  renewalBlock,
  renewalMessage,
  renewalPreview,
  sendVoucherRenewal,
  prepareRenewalSale,
  renewalPrivacyNotice,
} from './voucher-renewal';
const eligible = {
  appointment_status: 'completed',
  benefit_status: 'consumed',
  voucher_status: 'used',
  voucher_remaining: 0,
  consumed_sessions: 1,
  paid_amount: 30,
  currency: 'EUR',
  service_active: 1,
  phone: 'test',
  whatsapp_consent: 1,
  marketing_consent: 1,
  privacy_review_status: 'current',
  consent_reviewed_at: '2026-10-23',
  contact_id: 'client',
  service_id: 'service',
  voucher_id: 'voucher',
  name: 'Cliente Exemplo',
  service: 'Relaxamento',
  business: 'Clínica',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockImplementation(async (sql: string) => {
    if (sql.includes('information_schema'))
      return [{ table_name: 'clinic_voucher_renewals' }];
    if (sql.includes('FROM clinic_appointments')) return [eligible];
    if (sql.includes('FROM conversations')) return [{ id: 'conversation' }];
    return [{ remaining: 0 }];
  });
  mocks.mutate.mockResolvedValue({ affectedRows: 1 });
  mocks.send.mockResolvedValue({ whatsapp_message_id: 'accepted' });
});
it('only permits completed, consumed and exhausted single-session vouchers with proven permissions', () => {
  expect(renewalBlock(eligible, 0)).toBeNull();
  expect(
    renewalBlock(
      { ...eligible, voucher_status: 'active', voucher_remaining: 0 },
      0
    )
  ).toBeNull();
  for (const changes of [
    { appointment_status: 'confirmed' },
    { benefit_status: 'reserved' },
    { voucher_status: 'cancelled' },
    { voucher_remaining: 1 },
    { consumed_sessions: 2 },
    { paid_amount: null },
    { paid_amount: 0 },
    { paid_amount: Infinity },
    { whatsapp_consent: 0 },
    { marketing_consent: null },
    { privacy_review_status: 'legacy_unverified' },
    { consent_reviewed_at: null },
    { anonymized_at: 'now' },
    { service_active: 0 },
  ])
    expect(renewalBlock({ ...eligible, ...changes }, 0)).not.toBeNull();
  expect(renewalBlock(undefined, 0)).not.toBeNull();
  expect(renewalBlock(eligible, 2)).toContain('2 sessão');
});
it('checks all same-modality vouchers and reserved sessions using the account and client scope', async () => {
  mocks.select.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes('FROM clinic_appointments')) return [eligible];
    expect(values).toEqual(['account', 'client', 'service']);
    if (sql.includes('SUM(remaining_uses)')) {
      expect(sql).toContain('expires_at>UTC_TIMESTAMP');
      return [{ remaining: 2 }];
    }
    return [{ remaining: 1 }];
  });
  const result = await renewalPreview('account', 'appointment');
  expect(result.eligible).toBe(false);
  expect(result.remaining).toBe(2);
});
it('reserved sessions block the offer even when the available balance reports zero', async () => {
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM clinic_appointments')
      ? [eligible]
      : [{ remaining: sql.includes('COUNT(*) remaining') ? 1 : 0 }]
  );
  expect((await renewalPreview('account', 'appointment')).eligible).toBe(false);
});
it('sends the actual discounted price and a unique offer link, without charging or issuing a voucher', async () => {
  const text = renewalMessage(
    'Cliente Exemplo',
    'Relaxamento',
    30,
    'EUR',
    'Clínica'
  );
  expect(text).toContain('30,00');
  expect(text).toContain('apenas hoje');
  expect(text).toContain('MB WAY ou cartão');
  expect(text).not.toContain('SumUp');
  await sendVoucherRenewal('account', 'user', 'appointment', text, '912345678');
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send.mock.calls[0][0].text).toMatch(
    /\/api\/voucher-renewals\/[a-f0-9]{64}/
  );
  const claim = mocks.mutate.mock.calls.find((call) =>
    call[0].includes('INSERT IGNORE')
  );
  expect(claim?.[1]).toContain(30);
  expect(
    mocks.mutate.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_sales')
    )
  ).toBe(false);
});
it('refuses duplicate offers before WhatsApp and does not retry an uncertain outcome', async () => {
  mocks.mutate.mockImplementation(async (sql: string) => ({
    affectedRows: sql.includes('INSERT IGNORE') ? 0 : 1,
  }));
  await expect(
    sendVoucherRenewal(
      'account',
      'user',
      'appointment',
      'Mensagem',
      '912345678'
    )
  ).rejects.toThrow('Já existe');
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.mutate.mockResolvedValue({ affectedRows: 1 });
  mocks.send.mockRejectedValue(new Error('timeout'));
  await expect(
    sendVoucherRenewal(
      'account',
      'user',
      'appointment',
      'Mensagem',
      '912345678'
    )
  ).rejects.toThrow('confirmar o envio');
  expect(
    mocks.mutate.mock.calls.some((call) =>
      call[0].includes("status='uncertain'")
    )
  ).toBe(true);
});
it('rechecks marketing permissions before sending and rejects invalid MB WAY numbers', async () => {
  await expect(
    sendVoucherRenewal('account', 'user', 'appointment', 'Mensagem', 'invalid')
  ).rejects.toThrow('MB WAY');
  mocks.select.mockResolvedValue([{ ...eligible, marketing_consent: 0 }]);
  await expect(
    sendVoucherRenewal(
      'account',
      'user',
      'appointment',
      'Mensagem',
      '912345678'
    )
  ).rejects.toThrow('autorizações');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('allows only permission-related blocks to be overridden', async () => {
  const pending = {
    ...eligible,
    marketing_consent: 0,
    whatsapp_consent: 0,
    privacy_review_status: 'withdrawn',
  };
  expect(renewalBlock(pending, 0)).not.toBeNull();
  expect(renewalBlock(pending, 0, { overrideConsent: true })).toBeNull();
  for (const changes of [
    { phone: null },
    { anonymized_at: 'now' },
    { appointment_status: 'confirmed' },
    { paid_amount: 0 },
    { service_active: 0 },
  ])
    expect(
      renewalBlock({ ...pending, ...changes }, 0, { overrideConsent: true })
    ).not.toBeNull();
  expect(renewalBlock(pending, 1, { overrideConsent: true })).not.toBeNull();
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM clinic_appointments') ? [pending] : [{ remaining: 0 }]
  );
  const preview = await renewalPreview('account', 'appointment');
  expect(preview.eligible).toBe(false);
  expect(preview.canOverrideConsent).toBe(true);
});
it('records the explicit exception with its operator before sending and never changes permissions', async () => {
  mocks.select.mockImplementation(async (sql: string) => {
    if (sql.includes('information_schema'))
      return [{ table_name: 'clinic_voucher_renewals' }];
    if (sql.includes('FROM clinic_appointments'))
      return [{ ...eligible, marketing_consent: 0, portal_slug: 'clinica' }];
    if (sql.includes('FROM conversations')) return [{ id: 'conversation' }];
    return [{ remaining: 0 }];
  });
  await sendVoucherRenewal(
    'account',
    'user',
    'appointment',
    'Mensagem',
    '912345678',
    { overrideConsent: true }
  );
  const audit = mocks.mutate.mock.calls.find((call) =>
    call[0].includes('INSERT INTO clinic_agenda_events')
  );
  expect(audit?.[1]).toContain('user');
  expect(JSON.parse(audit?.[1].at(-1))).toMatchObject({
    consent_override: true,
    marketing_consent: 0,
    stage: 'send_requested',
  });
  const auditIndex = mocks.mutate.mock.calls.indexOf(audit!);
  expect(mocks.mutate.mock.invocationCallOrder[auditIndex]).toBeLessThan(
    mocks.send.mock.invocationCallOrder[0]
  );
  expect(mocks.send.mock.calls[0][0].text).toContain(
    'atualize as suas permissões'
  );
  expect(mocks.send.mock.calls[0][0].text).toContain('/portal/clinica');
  expect(
    mocks.mutate.mock.calls.some((call) => /UPDATE contacts/i.test(call[0]))
  ).toBe(false);
});
it('does not send an exception if the audit cannot be recorded', async () => {
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM clinic_appointments')
      ? [{ ...eligible, marketing_consent: 0 }]
      : [{ remaining: 0 }]
  );
  mocks.mutate.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO clinic_agenda_events'))
      throw new Error('audit unavailable');
    return { affectedRows: 1 };
  });
  await expect(
    sendVoucherRenewal(
      'account',
      'user',
      'appointment',
      'Mensagem',
      '912345678',
      { overrideConsent: true }
    )
  ).rejects.toThrow('registar');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(
    mocks.mutate.mock.calls.some((call) =>
      call[0].includes('DELETE FROM clinic_voucher_renewals')
    )
  ).toBe(true);
});
it('cannot override a remaining voucher and includes a usable site link in the privacy notice', async () => {
  mocks.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM clinic_appointments')
      ? [{ ...eligible, marketing_consent: 0 }]
      : [{ remaining: 1 }]
  );
  await expect(
    sendVoucherRenewal(
      'account',
      'user',
      'appointment',
      'Mensagem',
      '912345678',
      { overrideConsent: true }
    )
  ).rejects.toThrow('sessão');
  expect(mocks.send).not.toHaveBeenCalled();
  expect(renewalPrivacyNotice()).toContain('/portal');
  expect(renewalPrivacyNotice('clinica')).toContain('permitir ou recusar');
});
it('creates one unpaid sale and one pending service voucher atomically, with no payment registration', async () => {
  const execute = vi
    .fn()
    .mockImplementation(async (sql: string, values: unknown[]) => {
      expect((sql.match(/\?/g) || []).length).toBe(values.length);
      if (sql.includes('SELECT r.*'))
        return [
          [
            {
              id: 'offer',
              account_id: 'account',
              contact_id: 'client',
              service_id: 'service',
              service: 'Relaxamento',
              face: 45,
              amount: 30,
              currency: 'EUR',
              sale_id: null,
              sent_at: new Date(),
              expires_at: new Date(Date.now() + 3600000),
            },
          ],
        ];
      return [{ affectedRows: 1 }];
    });
  mocks.transaction.mockImplementation(async (work) => work({ execute }));
  const sale = await prepareRenewalSale('token');
  expect(sale.sale_id).toBeTruthy();
  const voucher = execute.mock.calls.find((call) =>
    call[0].includes('INSERT INTO finance_vouchers')
  );
  expect(voucher?.[0]).toContain("'pending'");
  expect(
    execute.mock.calls.some((call) =>
      call[0].includes('INSERT INTO finance_payments')
    )
  ).toBe(false);
  expect(execute.mock.calls[0][0]).toContain('FOR UPDATE');
});
it('reuses the original sale for repeated payment attempts', async () => {
  const execute = vi.fn().mockResolvedValue([
    [
      {
        id: 'offer',
        sale_id: 'existing-sale',
        sent_at: new Date(),
        expires_at: new Date(Date.now() + 3600000),
      },
    ],
  ]);
  mocks.transaction.mockImplementation(async (work) => work({ execute }));
  expect((await prepareRenewalSale('token')).sale_id).toBe('existing-sale');
  expect(execute).toHaveBeenCalledOnce();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  contactFilters: [] as unknown[],
  form: {} as Record<string, unknown>,
  contactBirth: null as unknown,
}));
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/notifications/account-events', () => ({
  notifyAccountEvent: vi.fn(),
}));
vi.mock('@/lib/privacy/consent-evidence', () => ({
  privacyNoticeVersion: vi.fn(),
  requestConsentEvidence: vi.fn(),
}));
import { GET } from './route';
const params = {
  params: Promise.resolve({ token: '12345678-1234-4234-8234-123456789abc' }),
};
beforeEach(() => {
  mocks.contactFilters = [];
  mocks.contactBirth = '1990-05-03T00:00:00.000Z';
  mocks.form = {
    id: 'form',
    account_id: 'account-a',
    contact_id: 'contact-a',
    status: 'pending',
    expires_at: '2099-01-01',
    birth_date: null,
  };
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((...args: unknown[]) => {
        if (table === 'contacts') mocks.contactFilters.push(args);
        return query;
      }),
      maybeSingle: vi.fn(async () => ({
        data:
          table === 'clinic_anamnesis_forms'
            ? mocks.form
            : table === 'contacts'
              ? { birth_date: mocks.contactBirth }
              : null,
      })),
    };
    return query;
  });
});
describe('Anamnesis birth date', () => {
  it('serializes a real MySQL Date from the linked contact as an HTML date value', async () => {
    mocks.contactBirth = new Date('1990-05-03T00:00:00.000Z');
    const response = await GET(
      new Request('https://crm.test/api/anamnese/token'),
      params
    );
    expect((await response.json()).form.birth_date).toBe('1990-05-03');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('serializes an existing form Date without dropping or replacing its calendar date', async () => {
    mocks.form.birth_date = new Date('1985-02-01T00:00:00.000Z');
    const result = await (
      await GET(new Request('https://crm.test/api/anamnese/token'), params)
    ).json();
    expect(result.form.birth_date).toBe('1985-02-01');
    expect(mocks.from).not.toHaveBeenCalledWith('contacts');
  });
  it('fills a pending blank date from its own contact and account only', async () => {
    const result = await (
      await GET(new Request('https://crm.test/api/anamnese/token'), params)
    ).json();
    expect(result.form.birth_date).toBe('1990-05-03');
    expect(result.form.contact_id).toBeUndefined();
    expect(mocks.contactFilters).toEqual([
      ['id', 'contact-a'],
      ['account_id', 'account-a'],
    ]);
  });
  it.each(['submitted', 'reviewed'])(
    'preserves the historical snapshot of a %s form',
    async (status) => {
      mocks.form.status = status;
      const result = await (
        await GET(new Request('https://crm.test/api/anamnese/token'), params)
      ).json();
      expect(result.form.birth_date).toBeNull();
      expect(mocks.from).not.toHaveBeenCalledWith('contacts');
    }
  );
  it('preserves a date already recorded on the form', async () => {
    mocks.form.birth_date = '1985-02-01';
    const result = await (
      await GET(new Request('https://crm.test/api/anamnese/token'), params)
    ).json();
    expect(result.form.birth_date).toBe('1985-02-01');
    expect(mocks.from).not.toHaveBeenCalledWith('contacts');
  });
});

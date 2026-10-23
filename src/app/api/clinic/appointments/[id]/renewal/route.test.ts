import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  preview: vi.fn(),
  history: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'Denied' }, { status: 403 }),
}));
vi.mock('@/lib/clinic/voucher-renewal', () => ({
  RenewalError: class extends Error {},
  renewalPreview: mocks.preview,
  renewalHistory: mocks.history,
  sendVoucherRenewal: mocks.send,
}));
import { GET, POST } from './route';
const params = { params: Promise.resolve({ id: 'appointment' }) };
const request = (body: unknown) =>
  new Request('https://crm.test/api/clinic/appointments/appointment/renewal', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account', userId: 'operator' });
  mocks.send.mockResolvedValue({ sent: true });
  mocks.history.mockResolvedValue(null);
  mocks.preview.mockResolvedValue({
    eligible: false,
    canOverrideConsent: true,
    reason: 'Permissões',
    privacyNotice: 'Reveja as permissões no site',
    row: { phone: 'private', contact_id: 'contact' },
  });
});
it('exposes the manual exception and privacy notice without returning the raw client row', async () => {
  const response = await GET(new Request('https://crm.test'), params);
  const body = await response.json();
  expect(body.canOverrideConsent).toBe(true);
  expect(body.privacyNotice).toContain('site');
  expect(body).not.toHaveProperty('row');
  expect(body).not.toHaveProperty('phone');
});
it('requires admin authorization and explicit confirmation before sending', async () => {
  expect(
    (await POST(request({ message: 'Oferta', overrideConsent: true }), params))
      .status
  ).toBe(409);
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.role.mockRejectedValue(new Error('Denied'));
  expect(
    (
      await POST(
        request({ confirm: true, message: 'Oferta', overrideConsent: true }),
        params
      )
    ).status
  ).toBe(403);
  expect(mocks.send).not.toHaveBeenCalled();
});
it('only forwards a literal true as an explicitly selected permission exception', async () => {
  for (const overrideConsent of [undefined, false, 'true', true]) {
    expect(
      (
        await POST(
          request({
            confirm: true,
            message: 'Oferta',
            mbwayPhone: '912345678',
            overrideConsent,
          }),
          params
        )
      ).status
    ).toBe(200);
    expect(mocks.send).toHaveBeenLastCalledWith(
      'account',
      'operator',
      'appointment',
      'Oferta',
      '912345678',
      { overrideConsent: overrideConsent === true }
    );
  }
  expect(mocks.role).toHaveBeenCalledWith('admin');
});

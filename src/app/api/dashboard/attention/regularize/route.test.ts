import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  transaction: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () =>
    Response.json({ error: 'Sem acesso' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ transaction: mocks.transaction }));
vi.mock('@/lib/dashboard/historical-appointments', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readHistoricalCandidates: mocks.preview,
  commitHistoricalAppointments: mocks.commit,
}));
import { POST } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'own-account', userId: 'owner' });
  mocks.transaction.mockImplementation((fn) => fn({}));
  mocks.preview.mockResolvedValue({ candidates: [] });
  mocks.commit.mockResolvedValue({ completed: 1 });
});
const send = (body: unknown) =>
  POST(
    new Request('https://crm.test/api/dashboard/attention/regularize', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
const valid = {
  action: 'commit',
  before: '2026-09-01',
  authorized: true,
  reason: 'Histórico anterior',
  selected: [
    { id: '00000000-0000-4000-8000-000000000001', revision: 'a'.repeat(64) },
  ],
};
it('requires the owner before reading or changing historical records', async () => {
  mocks.role.mockRejectedValueOnce(Error('Forbidden'));
  expect((await send(valid)).status).toBe(403);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('ignores tenant and actor fields supplied by the client', async () => {
  const response = await send({
    ...valid,
    accountId: 'foreign',
    userId: 'foreign',
  });
  expect(response.status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('owner');
  expect(mocks.commit.mock.calls[0].slice(1, 3)).toEqual([
    'own-account',
    'owner',
  ]);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it.each([
  { authorized: false },
  { reason: '' },
  { selected: [] },
  { selected: Array(201).fill(valid.selected[0]) },
  { selected: [valid.selected[0], valid.selected[0]] },
  { selected: [{ id: 'invalid', revision: 'a' }] },
])(
  'rejects missing authorization and invalid selections: %j',
  async (patch) => {
    expect((await send({ ...valid, ...patch })).status).toBe(400);
    expect(mocks.commit).not.toHaveBeenCalled();
  }
);
it('preview never commits and scopes the search', async () => {
  expect(
    (await send({ action: 'preview', before: '2026-09-01', search: 'Test' }))
      .status
  ).toBe(200);
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.preview.mock.calls[0][1]).toBe('own-account');
});

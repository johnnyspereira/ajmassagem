import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  rows: vi.fn(),
  tx: vi.fn(),
  execute: vi.fn(),
  schema: vi.fn(),
}));
vi.mock('@/lib/clinic/review-link-schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/clinic/review-link-schema')>()),
  ensureReviewLinkSchema: mocks.schema,
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () =>
    Response.json({ error: 'Sem acesso' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.rows,
  transaction: mocks.tx,
}));
import { GET, PUT } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'own' });
  mocks.schema.mockResolvedValue(undefined);
  mocks.rows.mockResolvedValue([
    { review_link_mode: 'system', review_google_url: null },
  ]);
  mocks.tx.mockImplementation((work) => work({ execute: mocks.execute }));
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT') ? [[{ account_id: 'own' }]] : [{}]
  );
});
const save = (body: unknown) =>
  PUT(
    new Request('https://crm.test/api/clinic/review-settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  );
it('requires admin permission before reading or writing', async () => {
  mocks.role.mockRejectedValueOnce(Error('Forbidden'));
  expect((await GET()).status).toBe(403);
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(mocks.schema).not.toHaveBeenCalled();
  mocks.role.mockRejectedValueOnce(Error('Forbidden'));
  expect((await save({ mode: 'system' })).status).toBe(403);
  expect(mocks.tx).not.toHaveBeenCalled();
});
it('reads the authenticated account with no shared caching', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('admin');
  expect(mocks.rows.mock.calls[0][1]).toEqual(['own']);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('saves only review destination fields and ignores a foreign tenant supplied by the browser', async () => {
  expect(
    (
      await save({
        mode: 'google',
        googleUrl: ' https://example.test/review ',
        accountId: 'foreign',
      })
    ).status
  ).toBe(200);
  const update = mocks.execute.mock.calls.find(([sql]) =>
    sql.startsWith('UPDATE')
  )!;
  expect(update[1]).toEqual(['google', 'https://example.test/review', 'own']);
  expect(update[0]).not.toContain('automated_message_templates');
});
it('preserves the external URL when switching back and succeeds even for unchanged values', async () => {
  expect((await save({ mode: 'system' })).status).toBe(200);
  const update = mocks.execute.mock.calls.find(([sql]) =>
    sql.startsWith('UPDATE')
  )!;
  expect(update[0]).not.toContain('review_google_url');
  expect(update[1]).toEqual(['system', 'own']);
});
it.each([
  { mode: 'bad' },
  { mode: 'google', googleUrl: 'http://invalid.test' },
  { mode: 'google', googleUrl: '' },
])('rejects invalid settings: %j', async (body) => {
  expect((await save(body)).status).toBe(400);
  expect(mocks.tx).not.toHaveBeenCalled();
});
it('requires initial clinic communication configuration', async () => {
  mocks.rows.mockResolvedValueOnce([]);
  expect((await GET()).status).toBe(409);
  mocks.execute.mockResolvedValueOnce([[]]);
  expect((await save({ mode: 'system' })).status).toBe(409);
  expect(
    mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))
  ).toBe(false);
});
it('prepares the schema before loading or saving and reports database permission failures', async () => {
  mocks.schema.mockRejectedValueOnce({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
  const response = await GET();
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('migração 057');
  expect(mocks.rows).not.toHaveBeenCalled();
  mocks.schema.mockRejectedValueOnce({ code: 'ER_NO_SUCH_TABLE' });
  expect((await save({ mode: 'system' })).status).toBe(503);
  expect(mocks.tx).not.toHaveBeenCalled();
});

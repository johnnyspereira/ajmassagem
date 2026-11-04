import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn(), rows: vi.fn(), schema: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({ requireRole: mocks.role, toErrorResponse: () => Response.json({ error: 'Sem acesso' }, { status: 403 }) }));
vi.mock('@/lib/mysql/db', () => ({ selectRows: mocks.rows }));
vi.mock('@/lib/clinic/review-link-schema', () => ({ ensureReviewLinkSchema: mocks.schema, reviewLinkSchemaError: () => null }));
import { GET } from './route';
const request = (id = 'chat') => GET(new Request(`https://crm.test/api/inbox/google-review-invitation?conversationId=${id}`));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'own', account: { name: 'JP Massagem' } });
  mocks.schema.mockResolvedValue(undefined);
  mocks.rows.mockResolvedValueOnce([{ name: 'Pessoa Teste' }]).mockResolvedValueOnce([{ review_google_url: 'https://g.page/r/test/review', review_link_mode: 'system' }]);
});
it('prepares only the selected account conversation and uses Google even when agenda uses system', async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(mocks.role).toHaveBeenCalledWith('agent');
  expect(mocks.rows.mock.calls[0][1]).toEqual(['chat', 'own']);
  expect(mocks.rows.mock.calls[0][0]).toContain('c.account_id=v.account_id');
  expect(mocks.rows.mock.calls[1][1]).toEqual(['own']);
  const { message } = await response.json();
  expect(message).toContain('Olá, Pessoa!');
  expect(message).toContain('https://g.page/r/test/review');
  expect(message).not.toContain('/avaliar/');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.rows.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('blocks read-only users before touching the database', async () => {
  mocks.role.mockRejectedValueOnce(new Error('Forbidden'));
  expect((await request()).status).toBe(403);
  expect(mocks.rows).not.toHaveBeenCalled();
  expect(mocks.schema).not.toHaveBeenCalled();
});
it('does not reveal settings for a missing or foreign conversation', async () => {
  mocks.rows.mockReset().mockResolvedValueOnce([]);
  expect((await request('foreign')).status).toBe(404);
  expect(mocks.rows).toHaveBeenCalledOnce();
  expect(mocks.schema).not.toHaveBeenCalled();
});
it('rejects a missing conversation', async () => {
  expect((await request('')).status).toBe(400);
  expect(mocks.rows).not.toHaveBeenCalled();
});
it.each([null, '', 'http://insecure.test', 'https://user:secret@example.test'])('explains missing or invalid Google configuration: %s', async (link) => {
  mocks.rows.mockReset().mockResolvedValueOnce([{ name: 'Pessoa' }]).mockResolvedValueOnce([{ review_google_url: link }]);
  const response = await request();
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('Definições');
});

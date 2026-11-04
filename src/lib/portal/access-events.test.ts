import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), schema: vi.fn() }));
vi.mock('@/lib/mysql/db', () => ({ mutate: mocks.mutate }));
vi.mock('./store-schema', () => ({ ensurePortalStoreSchema: mocks.schema }));
import { recordAccess } from './access-events';
it('records only an authenticated actor in its account with a five-minute deduplication bucket', async () => {
  await recordAccess({
    accountId: 'own',
    contactId: 'client',
    scope: 'campaign',
    resource: 'campaign',
  });
  const [sql, args] = mocks.mutate.mock.calls[0];
  expect(sql).toContain('INSERT IGNORE');
  expect(args.slice(1, 7)).toEqual([
    'own',
    'portal:client',
    'client',
    null,
    'campaign',
    'campaign',
  ]);
  expect(args[7]).toBe(Math.floor(Date.now() / 300000));
});
it('rejects an unidentifiable actor and logs no raw IP or user agent', async () => {
  mocks.mutate.mockClear();
  await expect(
    recordAccess({ accountId: 'own', scope: 'crm', resource: '/finance' })
  ).rejects.toThrow();
  expect(mocks.mutate).not.toHaveBeenCalled();
});

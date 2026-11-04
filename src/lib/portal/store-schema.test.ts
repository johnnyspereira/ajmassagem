import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rows:vi.fn(),mutate:vi.fn()}));
vi.mock('@/lib/mysql/db',()=>({selectRows:mocks.rows,mutate:mocks.mutate}));
beforeEach(()=>{vi.resetModules();vi.resetAllMocks();mocks.rows.mockResolvedValue([]);mocks.mutate.mockResolvedValue({});});
it('prepares missing columns and access table once for concurrent callers',async()=>{
  const {ensurePortalStoreSchema}=await import('./store-schema');
  await Promise.all([ensurePortalStoreSchema(),ensurePortalStoreSchema()]);
  expect(mocks.mutate).toHaveBeenCalledTimes(4);
  expect(mocks.mutate.mock.calls.map(([sql])=>sql).filter(sql=>sql.startsWith('ALTER TABLE'))).toHaveLength(3);
});
it('requires no DDL privilege when the migration is already installed',async()=>{
  mocks.rows.mockImplementation(async(sql:string)=>sql.includes("TABLE_NAME='portal_campaigns'")?[{COLUMN_NAME:'campaign_kind'},{COLUMN_NAME:'commerce_validity_days'}]:sql.includes('information_schema.TABLES')?[{TABLE_NAME:'crm_access_events'}]:[{COLUMN_NAME:'payment_method'}]);
  const {ensurePortalStoreSchema}=await import('./store-schema');
  await ensurePortalStoreSchema();
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('can retry after a database permission failure without marking readiness prematurely',async()=>{
  mocks.mutate.mockRejectedValueOnce({code:'ER_TABLEACCESS_DENIED_ERROR'});
  const {ensurePortalStoreSchema}=await import('./store-schema');
  await expect(ensurePortalStoreSchema()).rejects.toMatchObject({code:'ER_TABLEACCESS_DENIED_ERROR'});
  await expect(ensurePortalStoreSchema()).resolves.toBeUndefined();
});

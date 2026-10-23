import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ select: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  mutate: mocks.mutate,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.select.mockResolvedValue([]);
  mocks.mutate.mockResolvedValue({ affectedRows: 0 });
});
it('installs only the selected catalog column and shares concurrent requests', async () => {
  const { ensureCatalogOrderSchema } = await import('./catalog-order-schema');
  await Promise.all([
    ensureCatalogOrderSchema('services'),
    ensureCatalogOrderSchema('services'),
  ]);
  expect(mocks.select).toHaveBeenCalledOnce();
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(
    'ALTER TABLE clinic_services ADD COLUMN sort_order INT NOT NULL DEFAULT 1000000'
  );
  expect(mocks.select.mock.calls[0][1]).toEqual(['clinic_services']);
});
it('does not require ALTER when the column already exists or reset saved positions', async () => {
  mocks.select.mockResolvedValue([{ COLUMN_NAME: 'sort_order' }]);
  const { ensureCatalogOrderSchema } = await import('./catalog-order-schema');
  await ensureCatalogOrderSchema('products');
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('prepares all four supported catalogs independently', async () => {
  const { ensureCatalogOrderSchema } = await import('./catalog-order-schema');
  for (const kind of ['services', 'products', 'rooms', 'packs'] as const)
    await ensureCatalogOrderSchema(kind);
  expect(mocks.select.mock.calls.map((call) => call[1][0])).toEqual([
    'clinic_services',
    'clinic_products',
    'clinic_rooms',
    'finance_pack_catalog',
  ]);
});
it('tolerates another process adding the column and retries after a permission failure', async () => {
  const { ensureCatalogOrderSchema } = await import('./catalog-order-schema');
  mocks.mutate.mockRejectedValueOnce({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
  await expect(ensureCatalogOrderSchema('rooms')).rejects.toMatchObject({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
  });
  mocks.mutate.mockRejectedValueOnce({ code: 'ER_DUP_FIELDNAME' });
  await expect(ensureCatalogOrderSchema('rooms')).resolves.toBeUndefined();
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
});
it('rejects unknown table identifiers before accessing the database', async () => {
  const { ensureCatalogOrderSchema } = await import('./catalog-order-schema');
  expect(() => ensureCatalogOrderSchema('__proto__' as never)).toThrow();
  expect(mocks.select).not.toHaveBeenCalled();
});
it('returns actionable sanitized permission and missing-schema diagnostics', async () => {
  const { catalogOrderSchemaError } = await import('./catalog-order-schema');
  const denied = catalogOrderSchemaError({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
    message: 'private sql host',
  });
  expect(denied?.status).toBe(503);
  const body = await denied!.json();
  expect(body.error).toContain('ALTER');
  expect(body.error).not.toContain('private');
  expect(body.error).not.toContain('Reinicie');
  expect(catalogOrderSchemaError({ code: 'ER_NO_SUCH_TABLE' })?.status).toBe(
    503
  );
  expect(catalogOrderSchemaError(new Error('other'))).toBeNull();
});

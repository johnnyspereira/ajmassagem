import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  role: vi.fn(),
  select: vi.fn(),
  mutate: vi.fn(),
  ensure: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: m.role,
  toErrorResponse: () =>
    Response.json({ error: 'Access denied' }, { status: 403 }),
}));
vi.mock('@/lib/mysql/db', () => ({ selectRows: m.select, mutate: m.mutate }));
vi.mock('@/lib/finance/sale-documents', () => ({
  ensureSaleDocuments: m.ensure,
  MAX_SALE_DOCUMENT_BYTES: 10 * 1024 * 1024,
  writeSaleDocument: m.write,
  readSaleDocument: m.read,
  discardSaleDocument: m.discard,
  saleDocumentFormat: (bytes: Uint8Array) =>
    Buffer.from(bytes).toString().startsWith('%PDF-')
      ? { ext: 'pdf', mime: 'application/pdf' }
      : null,
}));
import { GET, POST } from './route';
const get = (q: string) =>
  new Request('https://crm.test/api/finance/sale-documents' + q);
const post = (
  file = new File(['%PDF-1.7 test document'], 'mbway.pdf', {
    type: 'application/pdf',
  })
) => {
  const form = new FormData();
  form.set('sale', 'sale');
  form.set('file', file);
  return new Request('https://crm.test/api/finance/sale-documents', {
    method: 'POST',
    body: form,
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  m.role.mockResolvedValue({ accountId: 'account', userId: 'user' });
  m.select.mockImplementation(async (sql: string) =>
    sql.includes('FROM finance_sales')
      ? [{ id: 'sale' }]
      : [
          {
            id: 'doc',
            file_name: 'mbway.pdf',
            mime_type: 'application/pdf',
            storage_key: 'account/doc.pdf',
          },
        ]
  );
  m.read.mockResolvedValue(Buffer.from('%PDF-1.7 test'));
  m.mutate.mockResolvedValue({ affectedRows: 1 });
  m.discard.mockResolvedValue(undefined);
});
it('lists only documents of a sale in the authenticated account without exposing storage paths', async () => {
  m.select
    .mockResolvedValueOnce([{ id: 'sale' }])
    .mockResolvedValueOnce([
      { id: 'doc', file_name: 'mbway.pdf', byte_size: 100 },
    ]);
  const r = await GET(get('?sale=sale'));
  expect(r.status).toBe(200);
  expect(m.select.mock.calls.map((c) => c[1])).toEqual([
    ['sale', 'account'],
    ['sale', 'account'],
  ]);
  expect(await r.json()).toEqual({
    documents: [{ id: 'doc', file_name: 'mbway.pdf', byte_size: 100 }],
  });
  expect(r.headers.get('Cache-Control')).toBe('private, no-store');
});
it('streams a protected document with private caching and no public URL', async () => {
  const r = await GET(get('?id=doc'));
  expect(r.status).toBe(200);
  expect(m.select.mock.calls[0][1]).toEqual(['doc', 'account']);
  expect(m.read).toHaveBeenCalledWith('account/doc.pdf');
  expect(r.headers.get('Content-Type')).toBe('application/pdf');
  expect(r.headers.get('Content-Disposition')).toContain('inline');
  expect(r.headers.get('Content-Security-Policy')).toContain('sandbox');
  expect(await r.text()).toContain('%PDF');
});
it('supports downloading the original file', async () =>
  expect(
    (await GET(get('?id=doc&download=1'))).headers.get('Content-Disposition')
  ).toContain('attachment'));
it('never reads another-account or missing document', async () => {
  m.select.mockResolvedValue([]);
  expect((await GET(get('?id=other'))).status).toBe(404);
  expect(m.read).not.toHaveBeenCalled();
});
it('blocks unauthenticated uploads and downloads before all storage operations', async () => {
  m.role.mockRejectedValue(new Error('Forbidden'));
  expect((await POST(post())).status).toBe(403);
  expect((await GET(get('?id=doc'))).status).toBe(403);
  expect(m.write).not.toHaveBeenCalled();
  expect(m.read).not.toHaveBeenCalled();
  expect(m.select).not.toHaveBeenCalled();
});
it('links a validated file to the existing sale without altering financial state', async () => {
  expect((await POST(post())).status).toBe(201);
  expect(m.select.mock.calls[0][1]).toEqual(['sale', 'account']);
  expect(m.write).toHaveBeenCalledOnce();
  expect(m.mutate).toHaveBeenCalledOnce();
  const [sql, args] = m.mutate.mock.calls[0];
  expect(sql).toContain('INSERT INTO finance_sale_documents');
  expect(sql).not.toMatch(/UPDATE|finance_payments/);
  expect(args.slice(1, 4)).toEqual(['account', 'sale', 'user']);
  expect(m.write.mock.calls[0][0]).toMatch(/^account\/[a-f0-9-]+\.pdf$/);
});
it('cleans up its new private file when insertion fails', async () => {
  m.mutate.mockRejectedValue(new Error('write failed'));
  await POST(post());
  expect(m.discard).toHaveBeenCalledWith(m.write.mock.calls[0][0]);
});
it('rejects foreign sales before saving a file', async () => {
  m.select.mockResolvedValue([]);
  expect((await POST(post())).status).toBe(404);
  expect(m.write).not.toHaveBeenCalled();
});
it('rejects unsupported and oversized files', async () => {
  expect(
    (
      await POST(
        post(
          new File(['<svg>bad file</svg>'], 'image.svg', {
            type: 'image/svg+xml',
          })
        )
      )
    ).status
  ).toBe(400);
  expect(
    (
      await POST(
        post(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf'))
      )
    ).status
  ).toBe(400);
  expect(m.write).not.toHaveBeenCalled();
});
it('rejects invalid identifiers', async () =>
  expect((await GET(get('?id=../private'))).status).toBe(400));

import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/mysql/db', () => ({ mutate: vi.fn() }));
import { saleDocumentFormat, readSaleDocument } from './sale-documents';
it('detects PDF, JPG, PNG and WebP from bytes rather than filename', () => {
  expect(saleDocumentFormat(Buffer.from('%PDF-1.7 file'))?.ext).toBe('pdf');
  expect(
    saleDocumentFormat(
      new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    )?.ext
  ).toBe('jpg');
  expect(
    saleDocumentFormat(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    )?.ext
  ).toBe('png');
  expect(saleDocumentFormat(Buffer.from('RIFF0000WEBP'))?.ext).toBe('webp');
  expect(saleDocumentFormat(Buffer.from('<svg>file</svg>'))).toBeNull();
  expect(saleDocumentFormat(Buffer.from('%PDF'))).toBeNull();
});
it('rejects traversal and public upload paths without touching the filesystem', () => {
  for (const key of [
    '../secret.pdf',
    'account/../../secret.pdf',
    '/uploads/media/x.pdf',
    'account/x.svg',
  ])
    expect(() => readSaleDocument(key)).toThrow('Invalid private document key');
});

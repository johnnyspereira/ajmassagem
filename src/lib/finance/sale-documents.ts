import 'server-only';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mutate } from '@/lib/mysql/db';

export const MAX_SALE_DOCUMENT_BYTES = 10 * 1024 * 1024;
let pending: Promise<void> | undefined;
export function ensureSaleDocuments() {
  pending ??= mutate(`CREATE TABLE IF NOT EXISTS finance_sale_documents (
    id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, sale_id CHAR(36) NOT NULL,
    uploaded_by_user_id CHAR(36) NOT NULL, file_name VARCHAR(200) NOT NULL,
    mime_type VARCHAR(64) NOT NULL, byte_size INT NOT NULL, storage_key VARCHAR(160) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX finance_sale_documents_sale(account_id,sale_id,created_at),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`)
    .then(() => {})
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

export function saleDocumentFormat(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 5) === '%PDF-')
    return { ext: 'pdf', mime: 'application/pdf' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { ext: 'jpg', mime: 'image/jpeg' };
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { ext: 'png', mime: 'image/png' };
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
    return { ext: 'webp', mime: 'image/webp' };
  return null;
}

// Deliberately outside data/uploads: the public /uploads route cannot serve these files.
function location(key: string) {
  if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(pdf|png|jpg|webp)$/.test(key))
    throw new Error('Invalid private document key');
  return path.join(
    path.resolve(
      process.env.FINANCE_DOCUMENT_DIR ||
        path.join(process.cwd(), 'data', 'finance-documents')
    ),
    key
  );
}
export async function writeSaleDocument(key: string, bytes: Uint8Array) {
  const target = location(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
}
export function readSaleDocument(key: string) {
  return readFile(location(key));
}
export function discardSaleDocument(key: string) {
  return unlink(location(key));
}

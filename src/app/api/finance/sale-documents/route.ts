import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mutate, selectRows } from '@/lib/mysql/db';
import {
  discardSaleDocument,
  ensureSaleDocuments,
  MAX_SALE_DOCUMENT_BYTES,
  readSaleDocument,
  saleDocumentFormat,
  writeSaleDocument,
} from '@/lib/finance/sale-documents';

const validId = (value: string | null): value is string =>
  !!value && /^[a-zA-Z0-9-]{1,64}$/.test(value);
export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const sale = params.get('sale');
    if (!validId(id || sale))
      return Response.json(
        { error: 'Indique a venda ou o comprovativo.' },
        { status: 400 }
      );
    await ensureSaleDocuments();
    if (id) {
      const rows = await selectRows<RowDataPacket[]>(
        'SELECT file_name,mime_type,storage_key FROM finance_sale_documents WHERE id=? AND account_id=?',
        [id, accountId]
      );
      if (!rows.length)
        return Response.json(
          { error: 'Comprovativo não encontrado.' },
          { status: 404 }
        );
      const file = rows[0];
      let bytes;
      try {
        bytes = await readSaleDocument(file.storage_key);
      } catch {
        return Response.json(
          {
            error: 'O ficheiro não está disponível. Contacte o administrador.',
          },
          { status: 404 }
        );
      }
      const name = encodeURIComponent(
        String(file.file_name).replace(/[\r\n]/g, '')
      ).replace(/'/g, '%27');
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': file.mime_type,
          'Content-Disposition': `${params.get('download') === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    const sales = await selectRows<RowDataPacket[]>(
      'SELECT id FROM finance_sales WHERE id=? AND account_id=?',
      [sale, accountId]
    );
    if (!sales.length)
      return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });
    const documents = await selectRows<RowDataPacket[]>(
      'SELECT id,file_name,mime_type,byte_size,created_at FROM finance_sale_documents WHERE sale_id=? AND account_id=? ORDER BY created_at DESC,id DESC',
      [sale, accountId]
    );
    return Response.json(
      { documents },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const form = await request.formData();
    const saleId = String(form.get('sale') || '');
    const file = form.get('file');
    if (!validId(saleId) || !(file instanceof File))
      return Response.json(
        { error: 'Escolha a venda e o ficheiro.' },
        { status: 400 }
      );
    if (!file.size || file.size > MAX_SALE_DOCUMENT_BYTES)
      return Response.json(
        { error: 'O comprovativo pode ter até 10 MB.' },
        { status: 400 }
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = saleDocumentFormat(bytes);
    if (!format)
      return Response.json(
        { error: 'Use um ficheiro PDF, JPG, PNG ou WebP.' },
        { status: 400 }
      );
    const sales = await selectRows<RowDataPacket[]>(
      'SELECT id FROM finance_sales WHERE id=? AND account_id=?',
      [saleId, accountId]
    );
    if (!sales.length)
      return Response.json({ error: 'Venda não encontrada.' }, { status: 404 });
    await ensureSaleDocuments();
    const id = randomUUID(),
      key = `${accountId}/${id}.${format.ext}`;
    const name = (
      file.name.split(/[\\/]/).pop() || `comprovativo.${format.ext}`
    )
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 200);
    await writeSaleDocument(key, bytes);
    try {
      await mutate(
        'INSERT INTO finance_sale_documents(id,account_id,sale_id,uploaded_by_user_id,file_name,mime_type,byte_size,storage_key) VALUES(?,?,?,?,?,?,?,?)',
        [id, accountId, saleId, userId, name, format.mime, file.size, key]
      );
    } catch (error) {
      await discardSaleDocument(key).catch(() => {});
      throw error;
    }
    return Response.json(
      {
        document: {
          id,
          file_name: name,
          mime_type: format.mime,
          byte_size: file.size,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

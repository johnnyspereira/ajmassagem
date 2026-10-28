import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { mutate, selectRows } from '@/lib/mysql/db';
import { ensureCatalogImages } from '@/lib/clinic/catalog-images';
import { publicStorageUrl, saveObject } from '@/lib/storage/local-storage';

const tables = {
  service: 'clinic_services',
  product: 'clinic_products',
  pack: 'finance_pack_catalog',
} as const;
export async function GET() {
  try {
    const { accountId } = await requireRole('agent');
    await ensureCatalogImages();
    const rows = await selectRows<RowDataPacket[]>(
      'SELECT kind,item_id,image_url FROM clinic_catalog_images WHERE account_id=?',
      [accountId]
    );
    return Response.json(
      {
        images: Object.fromEntries(
          rows.map((row) => [`${row.kind}:${row.item_id}`, row.image_url])
        ),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const form = await request.formData();
    const kind = String(form.get('kind') || ''),
      id = String(form.get('id') || '');
    if (!Object.hasOwn(tables, kind) || !id || id.length > 64)
      return Response.json({ error: 'Artigo inválido.' }, { status: 400 });
    const table = tables[kind as keyof typeof tables];
    const rows = await selectRows<RowDataPacket[]>(
      `SELECT id FROM ${table} WHERE id=? AND account_id=?`,
      [id, accountId]
    );
    if (!rows.length)
      return Response.json(
        { error: 'Artigo não encontrado.' },
        { status: 404 }
      );
    const file = form.get('file');
    if (form.get('remove') === 'true') {
      await ensureCatalogImages();
      await mutate(
        'DELETE FROM clinic_catalog_images WHERE account_id=? AND kind=? AND item_id=?',
        [accountId, kind, id]
      );
      return Response.json({ ok: true });
    }
    if (
      !(file instanceof File) ||
      file.size < 12 ||
      file.size > 2 * 1024 * 1024
    )
      return Response.json(
        { error: 'Escolha uma imagem JPG, PNG ou WebP até 2 MB.' },
        { status: 400 }
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext =
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        ? 'jpg'
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'png'
          : bytes.toString('ascii', 0, 4) === 'RIFF' &&
              bytes.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
    if (!ext)
      return Response.json(
        { error: 'Formato inválido. Use JPG, PNG ou WebP.' },
        { status: 400 }
      );
    await ensureCatalogImages();
    const path = `account-${accountId}/catalog/${randomUUID()}.${ext}`;
    await saveObject('media', path, bytes);
    const url = publicStorageUrl('media', path);
    await mutate(
      'INSERT INTO clinic_catalog_images(account_id,kind,item_id,image_url) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE image_url=VALUES(image_url)',
      [accountId, kind, id, url]
    );
    return Response.json({ ok: true, imageUrl: url });
  } catch (error) {
    return toErrorResponse(error);
  }
}

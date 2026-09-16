import { randomUUID } from 'node:crypto';
import { getSession } from '@/lib/auth/session';
import { getAuthContext } from '@/lib/auth/service';
import { decrypt } from '@/lib/whatsapp/encryption';
import { mutate, selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

type Connection = RowDataPacket & { refresh_token_encrypted: string };
type GoogleReview = { reviewId?: string; name?: string; comment?: string; createTime?: string; starRating?: string; reviewer?: { displayName?: string } };
const rating = (value?: string) => ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[value ?? ''] ?? 5);

export async function POST() {
  const session = await getSession(); const auth = session ? await getAuthContext(session.user.id) : null;
  if (!auth || auth.profile.account_role !== 'owner') return Response.json({ error: 'Sem autorização.' }, { status: 403 });
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim(); const secret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
  if (!clientId || !secret) return Response.json({ error: 'Credenciais Google não configuradas no servidor.' }, { status: 400 });
  const rows = await selectRows<Connection[]>('SELECT refresh_token_encrypted FROM google_business_profile_connections WHERE account_id=? LIMIT 1', [auth.account.id]);
  if (!rows[0]) return Response.json({ error: 'Ligue primeiro a conta Google.' }, { status: 400 });
  try {
    const refresh = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, refresh_token: decrypt(rows[0].refresh_token_encrypted), grant_type: 'refresh_token' }) });
    const token = await refresh.json() as { access_token?: string }; if (!refresh.ok || !token.access_token) throw new Error('Não foi possível renovar o acesso Google.');
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const accounts = await (await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers })).json() as { accounts?: Array<{ name?: string }> };
    const account = accounts.accounts?.[0]; if (!account?.name) throw new Error('Nenhum Perfil de Empresa Google autorizado foi encontrado.');
    const locations = await (await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`, { headers })).json() as { locations?: Array<{ name?: string }> };
    const location = locations.locations?.[0]; if (!location?.name) throw new Error('Nenhuma localização Google foi encontrada.');
    const reviewsResponse = await fetch(`https://mybusiness.googleapis.com/v4/${account.name}/${location.name}/reviews`, { headers });
    const payload = await reviewsResponse.json() as { reviews?: GoogleReview[]; error?: { message?: string } };
    if (!reviewsResponse.ok) throw new Error(payload.error?.message || 'A Google ainda não autorizou a leitura das avaliações.');
    for (const review of payload.reviews ?? []) {
      const reviewId = review.reviewId || review.name; if (!reviewId) continue;
      await mutate(`INSERT INTO google_business_profile_reviews(id,account_id,google_review_id,reviewer_name,rating,comment,reviewed_at) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE reviewer_name=VALUES(reviewer_name),rating=VALUES(rating),comment=VALUES(comment),reviewed_at=VALUES(reviewed_at),synced_at=UTC_TIMESTAMP(3)`, [randomUUID(), auth.account.id, reviewId, review.reviewer?.displayName ?? null, rating(review.starRating), review.comment ?? null, review.createTime ? new Date(review.createTime) : null]);
    }
    await mutate('UPDATE google_business_profile_connections SET google_account_name=? WHERE account_id=?', [account.name, auth.account.id]);
    return Response.json({ ok: true, imported: (payload.reviews ?? []).length });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Falha ao sincronizar avaliações.' }, { status: 400 }); }
}

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { selectRows, transaction } from '@/lib/mysql/db';
import {
  ensureRenewalSchema,
  prepareRenewalSale,
  RenewalError,
} from '@/lib/clinic/voucher-renewal';
import { getSumUpCredentials, sumUpRequest } from '@/lib/finance/sumup';
import { getPublicUrl } from '@/lib/public-url';
import { effectiveRenewalDeadline } from '@/lib/clinic/renewal-deadline';

const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.sumup.com; base-uri 'none'; frame-ancestors 'none'",
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!
  );
function page(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renovar experiência · JP Massagem</title><style>body{margin:0;background:#f8f7fc;color:#19232a;font:16px system-ui;display:grid;min-height:100dvh;place-items:center}main{margin:20px;padding:28px;background:white;border:1px solid #e6e1ee;border-radius:24px;max-width:460px}small{color:#7836e8}h1{font-size:28px}p{line-height:1.7}button{background:#7836e8;color:white;border:0;border-radius:12px;padding:16px 24px;width:100%;font:inherit;cursor:pointer}</style><main><small>JP MASSAGEM · O SEU MOMENTO</small>${content}</main></html>`,
    { status, headers }
  );
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token))
      return page('<h1>Oferta indisponível</h1>', 404);
    await ensureRenewalSchema();
    const rows = await selectRows<RowDataPacket[]>(
      `SELECT r.amount,r.currency,r.sale_id,r.sent_at,r.expires_at,s.name FROM clinic_voucher_renewals r JOIN clinic_services s ON s.id=r.service_id AND s.account_id=r.account_id WHERE r.token=? AND r.status='sent' AND r.expires_at>UTC_TIMESTAMP(3) AND s.is_active=TRUE`,
      [token]
    );
    const row = rows[0];
    if (
      !row ||
      effectiveRenewalDeadline(row.sent_at, row.expires_at).getTime() <=
        Date.now()
    )
      return page(
        '<h1>Esta oferta terminou</h1><p>Contacte a equipa para conhecer as opções disponíveis.</p>',
        410
      );
    const price = new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: row.currency,
    }).format(Number(row.amount));
    return page(
      `<h1>O bem-estar merece continuar.</h1><p>Um novo voucher para uma sessão de <strong>${escape(row.name)}</strong>, pelo mesmo valor anterior: <strong>${escape(price)}</strong>.</p><p>Voucher válido durante 365 dias a partir da compra. Marcação sujeita à disponibilidade. O voucher é ativado após confirmação do pagamento.</p><p><strong>Oferta válida apenas hoje, até às 23:59 (hora de Lisboa).</strong></p><form method="post"><button name="method" value="card" type="submit">Pagar com cartão</button><p></p><button name="method" value="mbway" type="submit">Transferir por MB WAY</button></form><p>Cartão: confirmação pelo prestador. MB WAY: a equipa confirma a receção da transferência antes de ativar o voucher.</p>`
    );
  } catch {
    return page(
      '<h1>Não foi possível abrir a oferta</h1><p>Tente novamente ou contacte a equipa.</p>',
      503
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new RenewalError('Oferta inválida.');
    const row = await prepareRenewalSale(token);
    const form = await request.formData();
    if (form.get('method') === 'mbway') {
      const sales = await selectRows<RowDataPacket[]>(
        'SELECT status FROM finance_sales WHERE id=? AND account_id=?',
        [row.sale_id, row.account_id]
      );
      if (sales[0]?.status === 'paid')
        return page(
          '<h1>Pagamento já confirmado</h1><p>Consulte o seu voucher no Portal.</p>'
        );
      if (sales[0]?.status !== 'open')
        throw new RenewalError(
          'Esta compra já não está disponível. Contacte a equipa.'
        );
      const price = new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: row.currency,
      }).format(Number(row.amount));
      return page(
        `<h1>Renovar por MB WAY</h1><p>Transfira <strong>${escape(price)}</strong> para o número <strong>${escape(row.mbway_phone)}</strong>.</p><p>Referência da oferta: <strong>${escape(row.id.slice(0, 8).toUpperCase())}</strong>. Envie-nos o comprovativo por WhatsApp com esta referência.</p><p>A sua compra está registada a aguardar pagamento. O voucher será ativado depois de a equipa confirmar a receção. A apresentação de um comprovativo não confirma automaticamente o pagamento.</p>`
      );
    }
    const { merchantCode } = getSumUpCredentials();
    // Serialize checkout creation. Reuse the same checkout so two clicks cannot produce two payable links.
    const url = await transaction(async (connection) => {
      const [offers] = await connection.execute<RowDataPacket[]>(
        'SELECT payment_link_id FROM clinic_voucher_renewals WHERE id=? FOR UPDATE',
        [row.id]
      );
      const [sales] = await connection.execute<RowDataPacket[]>(
        'SELECT status,balance_due FROM finance_sales WHERE id=? AND account_id=? FOR UPDATE',
        [row.sale_id, row.account_id]
      );
      if (
        sales[0]?.status !== 'open' ||
        Number(sales[0]?.balance_due) !== Number(row.amount)
      )
        throw new RenewalError(
          'Esta compra já foi paga ou alterada. Consulte o Portal ou contacte a equipa.'
        );
      if (offers[0].payment_link_id) {
        const [links] = await connection.execute<RowDataPacket[]>(
          'SELECT payment_url,status,external_session_id,created_at FROM finance_payment_links WHERE id=?',
          [offers[0].payment_link_id]
        );
        if (links[0]?.status === 'paid')
          throw new RenewalError(
            'Esta renovação já foi paga. Consulte o seu voucher no Portal.'
          );
        if (links[0]?.payment_url) {
          const created = new Date(links[0].created_at).getTime();
          if (
            !Number.isFinite(created) ||
            Date.now() - created < 31 * 60 * 1000
          )
            return String(links[0].payment_url);
          // Hosted SumUp URLs expire after 30 minutes. Check payment before replacing an expired URL.
          const previous = await sumUpRequest(
            `/v0.1/checkouts/${encodeURIComponent(links[0].external_session_id)}`,
            { signal: AbortSignal.timeout(15000) }
          );
          const state = (await previous.json()) as { status?: string };
          if (
            !previous.ok ||
            !['PENDING', 'FAILED', 'EXPIRED'].includes(state.status || '')
          )
            throw new RenewalError(
              'O pagamento anterior está em confirmação. Aguarde ou contacte a equipa antes de tentar novamente.'
            );
        }
      }
      const linkId = randomUUID();
      const response = await sumUpRequest('/v0.1/checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          amount: Number(row.amount),
          currency: row.currency,
          checkout_reference: `${row.id}-${linkId.slice(0, 8)}`,
          merchant_code: merchantCode,
          description: 'Prestação de serviços',
          valid_until: new Date(row.expires_at).toISOString(),
          return_url: getPublicUrl(
            '/api/finance/webhooks/sumup',
            new URL(request.url).origin
          ),
          hosted_checkout: { enabled: true },
        }),
      });
      const checkout = (await response.json()) as {
        id?: string;
        hosted_checkout_url?: string;
      };
      if (!response.ok || !checkout.id || !checkout.hosted_checkout_url)
        throw new RenewalError(
          'Não foi possível preparar o pagamento. Tente novamente ou contacte a equipa.'
        );
      const checkoutUrl = new URL(checkout.hosted_checkout_url);
      if (
        checkoutUrl.protocol !== 'https:' ||
        !(
          checkoutUrl.hostname === 'sumup.com' ||
          checkoutUrl.hostname.endsWith('.sumup.com')
        )
      )
        throw new RenewalError(
          'O prestador devolveu um endereço de pagamento inválido.'
        );
      await connection.execute(
        `INSERT INTO finance_payment_links(id,account_id,sale_id,contact_id,created_by_user_id,provider,status,amount,currency,description,external_reference,payment_url,external_session_id) VALUES(?,?,?,?,?,'sumup','pending',?,?,'Renovação de experiência',?,?,?)`,
        [
          linkId,
          row.account_id,
          row.sale_id,
          row.contact_id,
          row.created_by_user_id,
          row.amount,
          row.currency,
          row.id,
          checkout.hosted_checkout_url,
          checkout.id,
        ]
      );
      await connection.execute(
        'UPDATE clinic_voucher_renewals SET payment_link_id=? WHERE id=?',
        [linkId, row.id]
      );
      return checkout.hosted_checkout_url;
    });
    return Response.redirect(url, 303);
  } catch (error) {
    if (!(error instanceof RenewalError))
      console.error('[voucher-renewal] checkout failed', error);
    return page(
      `<h1>Não foi possível continuar</h1><p>${escape(error instanceof RenewalError ? error.message : 'Tente novamente ou contacte a equipa.')}</p>`,
      409
    );
  }
}

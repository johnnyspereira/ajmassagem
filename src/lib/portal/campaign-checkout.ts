import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { transaction } from '@/lib/mysql/db';
import { getSumUpCredentials, sumUpRequest } from '@/lib/finance/sumup';
import { PortalError } from './server';

export async function campaignCheckout(
  accountId: string,
  contactId: string,
  saleId: string,
  slug: string,
  origin: string,
  method: 'card' | 'mbway'
) {
  const link = await transaction(async (connection) => {
    const [sales] = await connection.execute<RowDataPacket[]>(
      'SELECT id,status,balance_due,currency,created_by_user_id FROM finance_sales WHERE id=? AND account_id=? AND contact_id=? FOR UPDATE',
      [saleId, accountId, contactId]
    );
    const sale = sales[0];
    if (!sale) throw new PortalError('Compra não encontrada.', 404);
    if (sale.status === 'paid') return { paid: true };
    if (!['open', 'partially_paid'].includes(sale.status))
      throw new PortalError('A compra foi anulada ou reembolsada.', 409);
    const [orders] = await connection.execute<RowDataPacket[]>(
      'SELECT payment_method FROM portal_campaign_enrollments WHERE sale_id=? AND account_id=? AND contact_id=? FOR UPDATE',
      [saleId, accountId, contactId]
    );
    if (!orders[0])
      throw new PortalError('Compra de campanha não encontrada.', 404);
    if (orders[0].payment_method && orders[0].payment_method !== method)
      throw new PortalError(
        'Esta compra já tem um método de pagamento escolhido. Retome esse método ou contacte a equipa para o alterar.',
        409
      );
    await connection.execute(
      'UPDATE portal_campaign_enrollments SET payment_method=? WHERE sale_id=? AND account_id=?',
      [method, saleId, accountId]
    );
    const [links] = await connection.execute<RowDataPacket[]>(
      "SELECT id,amount,status FROM finance_payment_links WHERE sale_id=? AND account_id=? AND provider='sumup' AND status IN ('pending','paid') ORDER BY created_at DESC FOR UPDATE",
      [saleId, accountId]
    );
    if (method === 'mbway') {
      if (links.length)
        throw new PortalError(
          'Esta compra já tem um link de cartão. Retome o pagamento por cartão para evitar pagamentos duplicados.',
          409
        );
      return {
        mbwayPhone: '935864343',
        due: Number(sale.balance_due),
        reference: saleId.slice(0, 8).toUpperCase(),
      };
    }
    if (links.length) {
      if (
        Number(links[0].amount) !== Number(sale.balance_due) ||
        links[0].status === 'paid'
      )
        throw new PortalError(
          'O saldo desta compra mudou. Confirme o pagamento com a equipa antes de voltar a pagar.',
          409
        );
      return { linkId: String(links[0].id), due: Number(sale.balance_due) };
    }
    const linkId = randomUUID();
    await connection.execute(
      `INSERT INTO finance_payment_links(id,account_id,sale_id,contact_id,provider,status,amount,currency,description,external_reference,created_by_user_id)
      VALUES(?,?,?,?,'sumup','pending',?,'EUR','Compra de campanha no Portal',?,?)`,
      [
        linkId,
        accountId,
        saleId,
        contactId,
        Number(sale.balance_due),
        linkId,
        sale.created_by_user_id || null,
      ]
    );
    return { linkId, due: Number(sale.balance_due) };
  });
  if (!('linkId' in link) || !link.linkId) return link;
  const linkId = link.linkId;
  const result = await transaction(async (connection) => {
    const [sales] = await connection.execute<RowDataPacket[]>(
      'SELECT id,status,balance_due,currency FROM finance_sales WHERE id=? AND account_id=? AND contact_id=? FOR UPDATE',
      [saleId, accountId, contactId]
    );
    const [links] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM finance_payment_links WHERE id=? AND account_id=? FOR UPDATE',
      [linkId, accountId]
    );
    const saved = links[0];
    if (sales[0]?.status === 'paid') return { paid: true };
    if (
      !saved ||
      !sales[0] ||
      !['open', 'partially_paid'].includes(sales[0].status) ||
      Number(saved.amount) !== Number(sales[0].balance_due)
    )
      return {
        error:
          'O saldo da compra mudou. Contacte a equipa antes de voltar a pagar.',
      };
    if (saved.payment_url) return { checkoutUrl: String(saved.payment_url) };
    try {
      const { merchantCode } = getSumUpCredentials();
      const listed = await sumUpRequest(
        `/v0.1/checkouts?checkout_reference=${encodeURIComponent(saved.id)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!listed.ok)
        throw new Error('Não foi possível consultar o pagamento por cartão.');
      const existing = await listed.json();
      let checkout = Array.isArray(existing)
        ? existing.find((c) => c.checkout_reference === saved.id)
        : null;
      if (!checkout) {
        const response = await sumUpRequest('/v0.1/checkouts', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(saved.amount),
            currency: 'EUR',
            checkout_reference: saved.id,
            merchant_code: merchantCode,
            description: 'Compra de campanha',
            hosted_checkout: { enabled: true },
            redirect_url: `${origin}/portal/${encodeURIComponent(slug)}?tab=finance`,
            return_url: `${origin}/api/finance/webhooks/sumup`,
          }),
        });
        checkout = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            'Não foi possível preparar o pagamento por cartão. Tente novamente; a compra foi preservada.'
          );
      }
      if (!checkout?.id || !checkout.hosted_checkout_url)
        throw new Error(
          'O pagamento existe, mas a ligação não está disponível. Contacte a equipa antes de voltar a pagar.'
        );
      await connection.execute(
        'UPDATE finance_payment_links SET external_session_id=?,payment_url=?,provider_payload=? WHERE id=? AND account_id=?',
        [
          checkout.id,
          checkout.hosted_checkout_url,
          JSON.stringify({
            checkout_status: checkout.status,
            campaign_purchase: true,
          }),
          saved.id,
          accountId,
        ]
      );
      return { checkoutUrl: String(checkout.hosted_checkout_url) };
    } catch (error) {
      // Persist the stable reference after timeout; retries look it up first.
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível preparar o pagamento.',
      };
    }
  });
  if ('error' in result) throw new PortalError(result.error!, 503);
  return result;
}

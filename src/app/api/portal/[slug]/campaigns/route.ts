import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import {
  requirePortalAccess,
  portalErrorResponse,
  PortalError,
} from '@/lib/portal/server';
import { purchaseCampaign } from '@/lib/portal/campaign-purchase';
import { campaignCheckout } from '@/lib/portal/campaign-checkout';
import { campaignVisible } from '@/lib/portal/campaign-rules';
import { ensurePortalStoreSchema } from '@/lib/portal/store-schema';
import { selectRows, transaction } from '@/lib/mysql/db';
import { getSumUpCredentials } from '@/lib/finance/sumup';
import { notifyAccountEvent } from '@/lib/notifications/account-events';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { access } = await requirePortalAccess(slug);
    const body = await request.json().catch(() => null);
    if (typeof body?.campaignId !== 'string' || body.campaignId.length > 36)
      throw new PortalError('Campanha inválida.');
    await ensurePortalStoreSchema();
    const campaigns = await selectRows<RowDataPacket[]>(
      'SELECT commerce_enabled,title FROM portal_campaigns WHERE id=? AND account_id=?',
      [body.campaignId, access.account_id]
    );
    if (!campaigns[0]) throw new PortalError('Campanha não encontrada.', 404);
    if (campaigns[0].commerce_enabled) {
      const method = body.paymentMethod;
      if (method !== 'card' && method !== 'mbway' && method !== 'wallet')
        throw new PortalError('Escolha como pretende pagar.');
      if (method === 'card') getSumUpCredentials();
      const quote = body.quote;
      if (
        !quote ||
        !['total', 'wallet', 'due'].every(
          (key) =>
            typeof quote[key] === 'number' &&
            Number.isFinite(quote[key]) &&
            quote[key] >= 0
        )
      )
        throw new PortalError(
          'Reveja os valores da compra antes de confirmar.'
        );
      const sale = await purchaseCampaign(
        access.account_id,
        access.contact_id,
        body.campaignId,
        quote
      );
      const result =
        sale.status === 'paid'
          ? { paid: true }
          : await campaignCheckout(
              access.account_id,
              access.contact_id,
              sale.id,
              slug,
              new URL(request.url).origin,
              method === 'card' ? 'card' : 'mbway'
            );
      if (!sale.reused) {
        try {
          await notifyAccountEvent({
            accountId: access.account_id,
            type: 'portal_campaign_purchase',
            category: 'broadcast',
            title:
              sale.status === 'paid'
                ? 'Compra de campanha paga'
                : 'Compra de campanha a aguardar pagamento',
            body: `${campaigns[0].title} · ${Number(sale.paid_amount).toFixed(2)} € registados · falta ${Number(sale.balance_due).toFixed(2)} €.`,
            actionUrl: `/finance?tab=sales#sale-${sale.id}`,
            contactId: access.contact_id,
            dedupeKey: `campaign-sale:${sale.id}`,
          });
        } catch (error) {
          console.error('[campaign-purchase] notification failed', error);
        }
      }
      return Response.json({
        ok: true,
        saleId: sale.id,
        saleNumber: sale.sale_number,
        paidAmount: Number(sale.paid_amount),
        due: Number(sale.balance_due),
        ...result,
      });
    }
    await transaction(async (connection) => {
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM portal_campaigns WHERE id=? AND account_id=? AND status='published' AND starts_at<=UTC_TIMESTAMP() AND (ends_at IS NULL OR ends_at>=UTC_TIMESTAMP()) FOR UPDATE",
        [body.campaignId, access.account_id]
      );
      if (!rows[0]) throw new PortalError('Campanha indisponível.', 404);
      const [wallets] = await connection.execute<RowDataPacket[]>(
        "SELECT balance FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency='EUR' FOR UPDATE",
        [access.account_id, access.contact_id]
      );
      if (
        !campaignVisible(
          rows[0].campaign_kind,
          Number(wallets[0]?.balance || 0)
        )
      )
        throw new PortalError(
          'Esta campanha promocional não está disponível para clientes com saldo.',
          409
        );
      const [previous] = await connection.execute<RowDataPacket[]>(
        'SELECT id,status FROM portal_campaign_enrollments WHERE campaign_id=? AND contact_id=? AND account_id=?',
        [body.campaignId, access.contact_id, access.account_id]
      );
      if (previous[0] && previous[0].status !== 'cancelled') return;
      const [counts] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) total FROM portal_campaign_enrollments WHERE campaign_id=? AND status<>'cancelled'",
        [body.campaignId]
      );
      if (
        rows[0].capacity &&
        Number(counts[0].total) >= Number(rows[0].capacity)
      )
        throw new PortalError('Campanha esgotada.', 409);
      await connection.execute(
        `INSERT INTO portal_campaign_enrollments(id,account_id,campaign_id,contact_id,status) VALUES(?,?,?,?,'joined') ON DUPLICATE KEY UPDATE status='joined',joined_at=UTC_TIMESTAMP(3)`,
        [randomUUID(), access.account_id, body.campaignId, access.contact_id]
      );
    });
    await notifyAccountEvent({
      accountId: access.account_id,
      type: 'portal_campaign_interest',
      category: 'broadcast',
      title: 'Novo interesse numa campanha',
      body: campaigns[0].title,
      contactId: access.contact_id,
      actionUrl: `/portal-campaigns?campaign=${body.campaignId}`,
      dedupeKey: `campaign-interest:${body.campaignId}:${access.contact_id}`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

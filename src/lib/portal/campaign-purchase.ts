import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { transaction } from '@/lib/mysql/db';
import { addPayment } from '@/lib/mysql/rpc';
import { PortalError } from './server';
import { campaignAmounts } from './campaign-rules';
import { ensurePortalStoreSchema } from './store-schema';
type CampaignSale = RowDataPacket & {
  id: string;
  status: string;
  balance_due: number;
  paid_amount: number;
  currency: string;
  sale_number: number;
};

export async function purchaseCampaign(
  accountId: string,
  contactId: string,
  campaignId: string,
  quote?: { total: number; wallet: number; due: number }
) {
  await ensurePortalStoreSchema();
  return transaction(async (connection) => {
    const [campaigns] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM portal_campaigns WHERE id=? AND account_id=? FOR UPDATE',
      [campaignId, accountId]
    );
    const campaign = campaigns[0];
    const [previous] = await connection.execute<CampaignSale[]>(
      `SELECT s.id,s.status,s.balance_due,s.paid_amount,s.currency,s.sale_number
       FROM portal_campaign_enrollments e JOIN finance_sales s ON s.id=e.sale_id AND s.account_id=e.account_id
       WHERE e.campaign_id=? AND e.contact_id=? AND e.account_id=?`,
      [campaignId, contactId, accountId]
    );
    // Existing orders are resumed even if the campaign closed or the wallet is now empty.
    if (previous[0] && !['voided', 'refunded'].includes(previous[0].status)) {
      if (
        quote &&
        Math.round(quote.due * 100) !==
          Math.round(Number(previous[0].balance_due) * 100)
      )
        throw new PortalError(
          'O valor pendente mudou. Atualize o Portal e reveja a compra.',
          409
        );
      return { ...previous[0], reused: true };
    }
    if (
      !campaign ||
      campaign.status !== 'published' ||
      new Date(campaign.starts_at).getTime() > Date.now() ||
      (campaign.ends_at && new Date(campaign.ends_at).getTime() < Date.now())
    )
      throw new PortalError('Esta campanha já não está disponível.', 404);
    const [wallets] = await connection.execute<RowDataPacket[]>(
      "SELECT balance FROM finance_client_wallets WHERE account_id=? AND contact_id=? AND currency='EUR' FOR UPDATE",
      [accountId, contactId]
    );
    let amounts;
    try {
      amounts = campaignAmounts(
        Number(campaign.commerce_price),
        Number(wallets[0]?.balance || 0),
        campaign.campaign_kind
      );
    } catch (error) {
      throw new PortalError((error as Error).message, 409);
    }
    if (
      quote &&
      (['total', 'wallet', 'due'] as const).some(
        (key) =>
          !Number.isFinite(quote[key]) ||
          Math.round(quote[key] * 100) !== Math.round(amounts[key] * 100)
      )
    )
      throw new PortalError(
        'O preço ou saldo mudou. Atualize o Portal e reveja a compra antes de confirmar.',
        409
      );
    if (!campaign.commerce_enabled || campaign.commerce_currency !== 'EUR')
      throw new PortalError(
        'Esta campanha não tem compra online em euros configurada.',
        409
      );
    if (campaign.capacity) {
      const [counts] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) total FROM portal_campaign_enrollments WHERE campaign_id=? AND account_id=? AND status<>'cancelled' AND contact_id<>?",
        [campaignId, accountId, contactId]
      );
      if (Number(counts[0].total) >= Number(campaign.capacity))
        throw new PortalError('Campanha esgotada.', 409);
    }
    const [owners] = await connection.execute<RowDataPacket[]>(
      'SELECT owner_user_id FROM accounts WHERE id=?',
      [accountId]
    );
    const owner = owners[0]?.owner_user_id;
    if (!owner)
      throw new PortalError('A conta não tem responsável financeiro.', 409);
    const pack = campaign.commerce_item_type === 'pack';
    const [catalog] = await connection.execute<RowDataPacket[]>(
      pack
        ? 'SELECT id,name,validity_days FROM finance_pack_catalog WHERE id=? AND account_id=? AND is_active=1 FOR UPDATE'
        : 'SELECT id,name,price FROM clinic_services WHERE id=? AND account_id=? AND is_active=1 FOR UPDATE',
      [campaign.commerce_source_id, accountId]
    );
    if (!catalog[0])
      throw new PortalError(
        'A modalidade ou pack desta campanha está indisponível. Contacte a equipa.',
        409
      );
    const [packItems] = pack
      ? await connection.execute<RowDataPacket[]>(
          `SELECT i.service_id,i.sessions FROM finance_pack_items i JOIN clinic_services s ON s.id=i.service_id
       WHERE i.pack_id=? AND s.account_id=? AND s.is_active=1`,
          [catalog[0].id, accountId]
        )
      : [[]];
    if (pack) {
      const [totalItems] = await connection.execute<RowDataPacket[]>(
        'SELECT COUNT(*) total FROM finance_pack_items WHERE pack_id=?',
        [catalog[0].id]
      );
      if (!packItems.length || packItems.length !== Number(totalItems[0].total))
        throw new PortalError('O pack inclui modalidades indisponíveis.', 409);
    }
    const saleId = randomUUID(),
      itemId = randomUUID();
    await connection.execute(
      `INSERT INTO finance_sales
      (id,account_id,contact_id,created_by_user_id,status,currency,subtotal,total_amount,paid_amount,balance_due,notes)
      VALUES(?,?,?,?,'open','EUR',?,?,0,?,?)`,
      [
        saleId,
        accountId,
        contactId,
        owner,
        amounts.total,
        amounts.total,
        amounts.total,
        `Compra no Portal · ${campaign.title} · ${campaign.campaign_kind === 'exchange' ? 'Troca de saldo' : 'Promocional'} · iniciativa do cliente`,
      ]
    );
    await connection.execute(
      `INSERT INTO finance_sale_items
      (id,sale_id,account_id,item_type,source_id,name_snapshot,quantity,unit_price,line_total,metadata)
      VALUES(?,?,?,?,?,?,1,?,?,?)`,
      [
        itemId,
        saleId,
        accountId,
        pack ? 'pack' : 'voucher',
        catalog[0].id,
        campaign.title,
        amounts.total,
        amounts.total,
        JSON.stringify({
          campaign_id: campaignId,
          service_id: pack ? null : catalog[0].id,
          voucher_type: pack ? null : 'service',
          campaign_kind: campaign.campaign_kind,
        }),
      ]
    );
    const code = randomBytes(6).toString('hex').toUpperCase();
    const pin = String(randomBytes(4).readUInt32BE() % 1000000).padStart(
      6,
      '0'
    );
    const validity = Math.min(
      3650,
      Math.max(
        1,
        Number(
          pack ? catalog[0].validity_days : campaign.commerce_validity_days
        ) || 365
      )
    );
    if (pack) {
      const packId = randomUUID();
      await connection.execute(
        `INSERT INTO finance_client_packs
        (id,account_id,contact_id,pack_id,sale_id,code,pin_code,status,expires_at)
        VALUES(?,?,?,?,?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY))`,
        [
          packId,
          accountId,
          contactId,
          catalog[0].id,
          saleId,
          `PCK-${code}`,
          pin,
          validity,
        ]
      );
      await connection.execute(
        `INSERT INTO finance_client_pack_balances(id,client_pack_id,service_id,total_sessions,remaining_sessions)
        SELECT UUID(),?,service_id,sessions,sessions FROM finance_pack_items WHERE pack_id=?`,
        [packId, catalog[0].id]
      );
    } else {
      await connection.execute(
        `INSERT INTO finance_vouchers
        (id,account_id,issued_sale_id,issued_sale_item_id,owner_contact_id,service_id,code,pin_code,voucher_type,remaining_uses,initial_balance,current_balance,paid_amount,currency,status,expires_at)
        VALUES(?,?,?,?,?,?,?,?,'service',1,?,?,0,'EUR','pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY))`,
        [
          randomUUID(),
          accountId,
          saleId,
          itemId,
          contactId,
          catalog[0].id,
          code,
          pin,
          Number(catalog[0].price),
          Number(catalog[0].price),
          validity,
        ]
      );
    }
    await connection.execute(
      `INSERT INTO portal_campaign_enrollments(id,account_id,campaign_id,contact_id,sale_id,status)
      VALUES(?,?,?,?,?,'joined') ON DUPLICATE KEY UPDATE sale_id=VALUES(sale_id),status='joined',payment_method=NULL,joined_at=UTC_TIMESTAMP(3)`,
      [randomUUID(), accountId, campaignId, contactId, saleId]
    );
    if (amounts.wallet > 0)
      await addPayment(connection, {
        accountId,
        userId: owner,
        saleId,
        method: 'client_credit',
        amount: amounts.wallet,
        cashSessionId: null,
        reference: campaignId,
        pin: null,
        notes: 'Saldo aplicado por iniciativa do cliente na loja do Portal',
      });
    const [sales] = await connection.execute<CampaignSale[]>(
      'SELECT id,status,balance_due,paid_amount,currency,sale_number FROM finance_sales WHERE id=? AND account_id=?',
      [saleId, accountId]
    );
    return { ...sales[0], reused: false };
  });
}

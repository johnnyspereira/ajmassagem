import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { selectRows, mutate, transaction } from '@/lib/mysql/db';
import { engineSendText } from '@/lib/automations/meta-send';
import { getPublicUrl } from '@/lib/public-url';
import { getSumUpCredentials } from '@/lib/finance/sumup';
import { renewalDeadline, effectiveRenewalDeadline } from './renewal-deadline';

export class RenewalError extends Error {}

export function renewalBlock(
  row: Record<string, unknown> | undefined,
  remaining: number,
  options: { overrideConsent?: boolean } = {}
) {
  if (!row) return 'Marcação ou voucher de modalidade não encontrado.';
  if (
    row.appointment_status !== 'completed' ||
    row.benefit_status !== 'consumed'
  )
    return 'Conclua a sessão e registe o consumo do voucher antes de renovar.';
  if (remaining > 0)
    return `O cliente ainda tem ${remaining} sessão(ões) de voucher disponível(is) nesta modalidade.`;
  if (
    !['active', 'used', 'expired'].includes(String(row.voucher_status)) ||
    Number(row.voucher_remaining) > 0
  )
    return 'O voucher utilizado ainda não está totalmente consumido.';
  if (Number(row.consumed_sessions) > 1)
    return 'Este voucher inclui várias sessões. A renovação de uma sessão pelo preço total não é aplicável; prepare uma proposta no Financeiro.';
  if (
    !Number.isFinite(Number(row.paid_amount)) ||
    !(Number(row.paid_amount) > 0)
  )
    return 'O valor efetivamente pago neste voucher não está apurado. Confirme a compra original no Financeiro.';
  if (!row.service_active)
    return 'Esta modalidade já não está disponível para venda.';
  if (!row.phone || row.anonymized_at)
    return 'O envio exige um cliente com telefone e uma ficha não anonimizada.';
  if (
    !options.overrideConsent &&
    (!row.whatsapp_consent ||
      !row.marketing_consent ||
      row.privacy_review_status !== 'current' ||
      !row.consent_reviewed_at)
  )
    return 'O envio desta oferta exige telefone e autorizações confirmadas de WhatsApp e marketing no Portal.';
  return null;
}

export function renewalPrivacyNotice(slug?: string | null) {
  const url = getPublicUrl(
    slug ? `/portal/${encodeURIComponent(slug)}` : '/portal',
    'https://jpmassagem.pt'
  );
  return `Pedimos também que atualize as suas permissões no nosso site. No Portal do Cliente, abra Perfil → Privacidade e comunicações para rever e permitir ou recusar cada opção de WhatsApp e marketing, conforme a sua preferência:\n${url}`;
}

export function renewalMessage(
  name: string,
  service: string,
  amount: number,
  currency: string,
  business: string
) {
  const price = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
  }).format(amount);
  return `Olá, ${name.split(' ')[0]}! ✨\n\nEsperamos que tenha desfrutado da sua sessão de ${service}. Acabou de utilizar o último voucher disponível desta modalidade — e gostaríamos de voltar a recebê-lo.\n\nPreparámos uma oportunidade especial: renove esta experiência por ${price}, o mesmo valor que pagou pelo voucher utilizado, mantendo a sua oferta anterior.\n\nEsta proposta permite adquirir um novo voucher para uma sessão e é válida apenas hoje, até às 23:59 (hora de Lisboa). O pagamento do seu voucher poderá ser feito via MB WAY ou cartão, através do link abaixo. A próxima sessão será marcada de acordo com a disponibilidade da agenda.\n\nGaranta o seu próximo momento de bem-estar. 💜\n\n${business}\n\nSe não desejar receber ofertas, pode alterar as suas preferências de marketing no Portal.`;
}

let schema: Promise<unknown> | undefined;
export async function ensureRenewalSchema() {
  if (!schema)
    schema = (async () => {
      const tables = await selectRows<RowDataPacket[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='clinic_voucher_renewals'"
      );
      if (tables.length) return;
      return mutate(`CREATE TABLE IF NOT EXISTS clinic_voucher_renewals (
    id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, appointment_id CHAR(36) NOT NULL,
    contact_id CHAR(36) NOT NULL, voucher_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL, created_by_user_id CHAR(36) NOT NULL,
    token CHAR(64) NOT NULL, amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'prepared', message TEXT NOT NULL, mbway_phone VARCHAR(20) NOT NULL,
    sale_id CHAR(36) NULL, payment_link_id CHAR(36) NULL, sent_at DATETIME(3) NULL,
    expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY renewal_source(account_id,voucher_id), UNIQUE KEY renewal_token(token),
    CONSTRAINT renewal_account_fk FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    CONSTRAINT renewal_contact_fk FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    })().catch((error) => {
      schema = undefined;
      throw error;
    });
  await schema;
}

export async function renewalPreview(accountId: string, appointmentId: string) {
  const rows = await selectRows<RowDataPacket[]>(
    `SELECT a.status appointment_status,a.contact_id,a.service_id,
    b.status benefit_status,v.id voucher_id,v.status voucher_status,v.remaining_uses voucher_remaining,v.paid_amount,v.currency,s.name service,s.is_active service_active,
    (SELECT COUNT(*) FROM finance_appointment_benefits used WHERE used.account_id=v.account_id AND used.voucher_id=v.id AND used.status='consumed') consumed_sessions,
    c.name,c.phone,c.whatsapp_consent,c.marketing_consent,c.privacy_review_status,c.consent_reviewed_at,c.anonymized_at,
    ac.name business,
    (SELECT s.slug FROM client_portal_settings s WHERE s.account_id=a.account_id AND s.enabled=TRUE LIMIT 1) portal_slug
    FROM clinic_appointments a JOIN finance_appointment_benefits b ON b.appointment_id=a.id AND b.account_id=a.account_id
    JOIN finance_vouchers v ON v.id=b.voucher_id AND v.account_id=a.account_id AND v.owner_contact_id=a.contact_id AND v.service_id=a.service_id AND v.voucher_type='service'
    JOIN clinic_services s ON s.id=a.service_id AND s.account_id=a.account_id
    JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id JOIN accounts ac ON ac.id=a.account_id
    WHERE a.account_id=? AND a.id=? AND b.status='consumed' LIMIT 1`,
    [accountId, appointmentId]
  );
  const row = rows[0];
  let remaining = 0;
  if (row) {
    const available = await selectRows<RowDataPacket[]>(
      `SELECT COALESCE(SUM(remaining_uses),0) remaining FROM finance_vouchers WHERE account_id=? AND owner_contact_id=? AND service_id=? AND voucher_type='service' AND status='active' AND remaining_uses>0 AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP(3))`,
      [accountId, row.contact_id, row.service_id]
    );
    remaining = Number(available[0]?.remaining || 0);
    // Sessions reserved for another appointment still belong to the client.
    const reserved = await selectRows<RowDataPacket[]>(
      `SELECT COUNT(*) remaining FROM finance_appointment_benefits b JOIN finance_vouchers v ON v.id=b.voucher_id AND v.account_id=b.account_id WHERE b.account_id=? AND b.contact_id=? AND b.service_id=? AND b.status='reserved' AND v.voucher_type='service'`,
      [accountId, row.contact_id, row.service_id]
    );
    remaining = Math.max(remaining, Number(reserved[0]?.remaining || 0));
  }
  const reason = renewalBlock(row, remaining);
  return {
    eligible: !reason,
    canOverrideConsent:
      !!reason && !renewalBlock(row, remaining, { overrideConsent: true }),
    privacyNotice: renewalPrivacyNotice(row?.portal_slug),
    reason,
    remaining,
    row,
    amount: Number(row?.paid_amount || 0),
    currency: row?.currency || 'EUR',
    service: row?.service || '',
    message: row
      ? renewalMessage(
          row.name || 'Cliente',
          row.service,
          Number(row.paid_amount),
          row.currency,
          row.business
        )
      : '',
  };
}

export async function sendVoucherRenewal(
  accountId: string,
  userId: string,
  appointmentId: string,
  message: string,
  mbwayPhone: string,
  options: { overrideConsent?: boolean } = {}
) {
  getSumUpCredentials();
  const phone = mbwayPhone.replace(/\s/g, '');
  if (!/^(?:\+351)?9\d{8}$/.test(phone))
    throw new RenewalError('Indique um número MB WAY português válido.');
  if (!message.trim() || message.length > 4000)
    throw new RenewalError('Reveja a mensagem (máximo de 4000 caracteres).');
  await ensureRenewalSchema();
  const preview = await renewalPreview(accountId, appointmentId);
  const overridden =
    !preview.eligible &&
    preview.canOverrideConsent &&
    options.overrideConsent === true;
  if ((!preview.eligible && !overridden) || !preview.row)
    throw new RenewalError(preview.reason || 'Oferta indisponível.');
  const row = preview.row;
  const finalMessage = `${message.trim()}\n\n${preview.privacyNotice}`;
  const id = randomUUID(),
    token = randomBytes(32).toString('hex');
  const claim = await mutate(
    `INSERT IGNORE INTO clinic_voucher_renewals(id,account_id,appointment_id,contact_id,voucher_id,service_id,created_by_user_id,token,amount,currency,message,mbway_phone,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      accountId,
      appointmentId,
      row.contact_id,
      row.voucher_id,
      row.service_id,
      userId,
      token,
      preview.amount,
      preview.currency,
      finalMessage,
      phone,
      renewalDeadline(),
    ]
  );
  if (!claim.affectedRows)
    throw new RenewalError(
      'Já existe uma oferta para este voucher. Consulte o estado antes de voltar a contactar o cliente.'
    );
  if (overridden) {
    try {
      await mutate(
        `INSERT INTO clinic_agenda_events(id,account_id,user_id,entity_type,entity_id,action,reason,metadata) VALUES(?,?,?,'appointment',?,'updated',?,?)`,
        [
          randomUUID(),
          accountId,
          userId,
          appointmentId,
          'Envio excecional da oferta autorizado manualmente, sem alterar permissões do cliente.',
          JSON.stringify({
            message_action: 'voucher_renewal',
            renewal_id: id,
            consent_override: true,
            stage: 'send_requested',
            whatsapp_consent: row.whatsapp_consent ?? null,
            marketing_consent: row.marketing_consent ?? null,
            privacy_review_status: row.privacy_review_status ?? null,
          }),
        ]
      );
    } catch {
      await mutate(
        "DELETE FROM clinic_voucher_renewals WHERE id=? AND account_id=? AND status='prepared'",
        [id, accountId]
      );
      throw new RenewalError(
        'Não foi possível registar a confirmação do envio excecional. Nenhuma mensagem foi enviada. Tente novamente.'
      );
    }
  }
  const link = getPublicUrl(
    `/api/voucher-renewals/${token}`,
    'https://jpmassagem.pt'
  );
  // Keep a durable claim before calling WhatsApp. An uncertain network outcome must never cause an automatic duplicate.
  await mutate(
    "UPDATE clinic_voucher_renewals SET status='sending' WHERE id=?",
    [id]
  );
  try {
    const conv = await selectRows<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE account_id=? AND contact_id=? ORDER BY created_at LIMIT 1',
      [accountId, row.contact_id]
    );
    const conversationId = conv[0]?.id || randomUUID();
    if (!conv.length)
      await mutate(
        'INSERT INTO conversations(id,account_id,contact_id,user_id) VALUES(?,?,?,?)',
        [conversationId, accountId, row.contact_id, userId]
      );
    const result = await engineSendText({
      accountId,
      userId,
      conversationId,
      contactId: row.contact_id,
      text: `${finalMessage}\n\nAdquirir novo voucher:\n${link}`,
    });
    if (!result.whatsapp_message_id)
      throw new Error('Sem confirmação do canal');
    await mutate(
      "UPDATE clinic_voucher_renewals SET status='sent',sent_at=UTC_TIMESTAMP(3) WHERE id=?",
      [id]
    );
    return { sent: true };
  } catch {
    await mutate(
      "UPDATE clinic_voucher_renewals SET status='uncertain' WHERE id=?",
      [id]
    );
    throw new RenewalError(
      'Não foi possível confirmar o envio. Verifique a conversa no Inbox antes de contactar novamente; a oferta ficou registada para evitar duplicações.'
    );
  }
}

export async function renewalHistory(accountId: string, appointmentId: string) {
  await ensureRenewalSchema();
  const rows = await selectRows<RowDataPacket[]>(
    'SELECT r.status,r.sent_at,r.expires_at,r.amount,r.currency,r.sale_id,s.status payment_status FROM clinic_voucher_renewals r LEFT JOIN finance_sales s ON s.id=r.sale_id AND s.account_id=r.account_id WHERE r.account_id=? AND r.appointment_id=?',
    [accountId, appointmentId]
  );
  return rows[0] || null;
}

export async function prepareRenewalSale(token: string) {
  await ensureRenewalSchema();
  return transaction(async (connection) => {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT r.*,s.name service,s.price face,c.anonymized_at FROM clinic_voucher_renewals r JOIN clinic_services s ON s.id=r.service_id AND s.account_id=r.account_id JOIN contacts c ON c.id=r.contact_id AND c.account_id=r.account_id WHERE r.token=? AND r.status='sent' AND r.expires_at>UTC_TIMESTAMP(3) AND s.is_active=TRUE FOR UPDATE`,
      [token]
    );
    const row = rows[0];
    if (!row || row.anonymized_at)
      throw new RenewalError(
        'Esta oferta terminou ou já não está disponível. Contacte a equipa.'
      );
    row.expires_at = effectiveRenewalDeadline(row.sent_at, row.expires_at);
    if (row.expires_at.getTime() <= Date.now())
      throw new RenewalError(
        'Esta oferta terminou. A oferta é válida apenas no dia do envio, até às 23:59 de Lisboa.'
      );
    if (row.sale_id) return row;
    const saleId = randomUUID(),
      itemId = randomUUID();
    await connection.execute(
      `INSERT INTO finance_sales(id,account_id,contact_id,created_by_user_id,status,currency,subtotal,discount_amount,tax_amount,total_amount,paid_amount,balance_due,notes) VALUES(?,?,?,?,'open',?,?,0,0,?,0,?,?)`,
      [
        saleId,
        row.account_id,
        row.contact_id,
        row.created_by_user_id,
        row.currency,
        row.amount,
        row.amount,
        row.amount,
        `Renovação de experiência · Ref. ${String(row.id).slice(0, 8).toUpperCase()} · oferta individual após último voucher`,
      ]
    );
    await connection.execute(
      `INSERT INTO finance_sale_items(id,sale_id,account_id,item_type,source_id,name_snapshot,quantity,unit_price,discount_amount,tax_rate,tax_amount,line_total,metadata) VALUES(?,?,?,'voucher',?,?,1,?,0,0,0,?,?)`,
      [
        itemId,
        saleId,
        row.account_id,
        row.service_id,
        row.service,
        row.amount,
        row.amount,
        JSON.stringify({
          voucher_type: 'service',
          service_id: row.service_id,
          remaining_uses: 1,
          renewal_id: row.id,
        }),
      ]
    );
    await connection.execute(
      `INSERT INTO finance_vouchers(id,account_id,issued_sale_id,issued_sale_item_id,owner_contact_id,service_id,code,pin_code,voucher_type,remaining_uses,initial_balance,paid_amount,current_balance,currency,status,expires_at) VALUES(?,?,?,?,?,?,?,?,'service',1,?,0,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 365 DAY))`,
      [
        randomUUID(),
        row.account_id,
        saleId,
        itemId,
        row.contact_id,
        row.service_id,
        randomBytes(6).toString('hex').toUpperCase(),
        String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, '0'),
        row.face,
        row.face,
        row.currency,
      ]
    );
    await connection.execute(
      'UPDATE clinic_voucher_renewals SET sale_id=? WHERE id=?',
      [saleId, row.id]
    );
    return { ...row, sale_id: saleId };
  });
}

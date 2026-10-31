import type { RowDataPacket } from 'mysql2';
import { selectRows } from '@/lib/mysql/db';
import {
  accountDateInput,
  accountDateTimeToUtc,
  accountTimeInput,
} from '@/lib/timezone';
import {
  ATTENTION_KINDS,
  type AttentionData,
  type AttentionItem,
  type AttentionKind,
} from './attention-types';

/** Only outstanding work is selected. Reading the queue never settles money or changes states. */
export function attentionSource(accountId: string, now: Date) {
  const day = accountDateTimeToUtc(
    accountDateInput(now, 'Europe/Lisbon'),
    '00:00',
    'Europe/Lisbon'
  );
  const late = new Date(now.getTime() - 15 * 60_000);
  // Same closing window as the existing daily-operations reminders.
  const closing = accountTimeInput(now, 'Europe/Lisbon') >= '21:30';
  const clauses = [
    {
      sql: `SELECT 'appointments' kind,a.id entity_id,a.id target_id,a.contact_id,c.name,
        COALESCE(s.name,'Atendimento') title,
        CASE WHEN EXISTS(SELECT 1 FROM finance_appointment_benefits b WHERE b.appointment_id=a.id AND b.account_id=a.account_id AND b.status='reserved') THEN 'Sessão terminou sem fecho; tem benefício reservado por utilizar.' ELSE 'Sessão terminou sem fecho. Reveja Concluído, Faltou ou Cancelado.' END detail,
        a.scheduled_start occurred_at,NULL amount,NULL currency,CASE WHEN a.scheduled_end>=? THEN 0 ELSE 2 END priority
      FROM clinic_appointments a LEFT JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id
      LEFT JOIN clinic_services s ON s.id=a.service_id AND s.account_id=a.account_id
      WHERE a.account_id=? AND a.status IN ('scheduled','confirmed') AND a.scheduled_end<?`,
      values: [day, accountId, now],
    },
    {
      sql: `SELECT 'payments' kind,s.id entity_id,s.id target_id,s.contact_id,c.name,
        CONCAT('Venda #',s.sale_number) title,'Saldo por receber. Reveja o pagamento e o comprovativo da venda.' detail,
        s.created_at occurred_at,s.balance_due amount,s.currency,2 priority
      FROM finance_sales s LEFT JOIN contacts c ON c.id=s.contact_id AND c.account_id=s.account_id
      WHERE s.account_id=? AND s.status IN ('open','partially_paid') AND s.balance_due>0 AND COALESCE(s.is_historical,0)=0`,
      values: [accountId],
    },
    {
      sql: `SELECT 'benefits' kind,b.id entity_id,a.id target_id,a.contact_id,c.name,
        CASE WHEN b.benefit_type='pack' THEN 'Sessão do pack por utilizar' ELSE 'Voucher por utilizar' END title,
        'Atendimento concluído, mas o benefício continua reservado. Reveja antes de descontar.' detail,
        a.scheduled_start occurred_at,NULL amount,NULL currency,1 priority
      FROM finance_appointment_benefits b JOIN clinic_appointments a ON a.id=b.appointment_id AND a.account_id=b.account_id
      LEFT JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id
      WHERE b.account_id=? AND b.status='reserved' AND a.status='completed' AND a.scheduled_end<?`,
      values: [accountId, now],
    },
    {
      sql: `SELECT 'cash' kind,s.id entity_id,s.id target_id,NULL contact_id,'Turno de caixa' name,
        'Conferir e fechar caixa' title,'O turno continua aberto. Confira os valores antes de fechar.' detail,
        s.opened_at occurred_at,NULL amount,NULL currency,0 priority
      FROM finance_cash_sessions s WHERE s.account_id=? AND s.status='open' AND (s.opened_at<? OR ?=1)`,
      values: [accountId, day, closing ? 1 : 0],
    },
    {
      sql: `SELECT 'messages' kind,o.id entity_id,o.conversation_id target_id,v.contact_id,c.name,
        CASE WHEN o.status IN ('failed','dead') THEN 'Mensagem não enviada' ELSE 'Mensagem ainda na fila' END title,
        CONCAT('Tentativas: ',o.attempts,'. Reveja a mensagem e a ligação do WhatsApp antes de reenviar.') detail,
        o.created_at occurred_at,NULL amount,NULL currency,1 priority
      FROM whatsapp_outbox o JOIN conversations v ON v.id=o.conversation_id AND v.account_id=o.account_id
      LEFT JOIN contacts c ON c.id=v.contact_id AND c.account_id=v.account_id
      WHERE o.account_id=? AND (o.status IN ('failed','dead') OR (o.status IN ('pending','processing') AND o.available_at<? AND (o.lease_until IS NULL OR o.lease_until<?)))`,
      values: [accountId, late, now],
    },
  ];
  return {
    sql: clauses.map((clause) => clause.sql).join(' UNION ALL '),
    values: clauses.flatMap((clause) => clause.values),
  };
}

export async function loadAttention(
  accountId: string,
  kind: AttentionKind | 'all',
  page: number,
  search = '',
  now = new Date()
): Promise<AttentionData> {
  const source = attentionSource(accountId, now);
  const searchSql = search
    ? "WHERE CONCAT_WS(' ',name,title,detail) LIKE ? ESCAPE '!'"
    : '';
  const searchValues = search ? [`%${search.replace(/[!%_]/g, '!$&')}%`] : [];
  const filtered = `SELECT * FROM (${source.sql}) source ${searchSql}`;
  const pageSize = 5;
  const [totals, rows] = await Promise.all([
    selectRows<RowDataPacket[]>(
      `SELECT kind,COUNT(*) total FROM (${filtered}) attention GROUP BY kind`,
      [...source.values, ...searchValues]
    ),
    selectRows<RowDataPacket[]>(
      `SELECT * FROM (${filtered}) attention ${kind === 'all' ? '' : 'WHERE kind=?'} ORDER BY priority,occurred_at DESC,kind,entity_id LIMIT ? OFFSET ?`,
      [
        ...source.values,
        ...searchValues,
        ...(kind === 'all' ? [] : [kind]),
        pageSize + 1,
        page * pageSize,
      ]
    ),
  ]);
  const counts = Object.fromEntries(
    ATTENTION_KINDS.map((key) => [key, 0])
  ) as Record<AttentionKind, number>;
  for (const row of totals)
    if (ATTENTION_KINDS.includes(row.kind))
      counts[row.kind as AttentionKind] = Number(row.total);
  const items: AttentionItem[] = rows.slice(0, pageSize).map((row) => {
    const kind = row.kind as AttentionKind;
    const target = encodeURIComponent(String(row.target_id));
    return {
      id: `${kind}:${row.entity_id}`,
      kind,
      name:
        row.name ||
        (kind === 'cash' ? 'Turno de caixa' : 'Cliente não identificado'),
      contactId: row.contact_id || null,
      title: row.title,
      detail: row.detail,
      occurredAt: new Date(row.occurred_at).toISOString(),
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency || null,
      urgent: Number(row.priority) === 0,
      href:
        kind === 'payments'
          ? `/finance?tab=sales#sale-${target}`
          : kind === 'cash'
            ? '/finance?tab=cash'
            : kind === 'messages'
              ? `/inbox?c=${target}`
              : `/agenda?appointment=${target}`,
      action:
        kind === 'payments'
          ? 'Rever pagamento'
          : kind === 'cash'
            ? 'Conferir caixa'
            : kind === 'messages'
              ? 'Rever conversa'
              : 'Abrir marcação',
    };
  });
  return {
    generatedAt: now.toISOString(),
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    items,
    page,
    pageSize,
    hasMore: rows.length > pageSize,
  };
}

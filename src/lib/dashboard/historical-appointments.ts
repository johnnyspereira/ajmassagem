import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { accountDateInput, accountDateTimeToUtc } from '@/lib/timezone';

export class HistoricalError extends Error {
  constructor(
    message: string,
    public status = 409
  ) {
    super(message);
  }
}
export type HistoricalCandidate = {
  id: string;
  name: string;
  service: string;
  start: string;
  amount: number;
  currency: string;
  revision: string;
  plan: 'historical' | 'complete' | 'excluded';
  detail: string;
};
export function historicalPlan(
  sales: RowDataPacket[],
  benefits: RowDataPacket[]
) {
  if (benefits.some((b) => b.status === 'reserved'))
    return {
      plan: 'excluded' as const,
      detail: 'Benefício reservado: rever e utilizar individualmente.',
    };
  if (
    sales.some((s) => !['paid'].includes(s.status) || Number(s.balance_due) > 0)
  )
    return {
      plan: 'excluded' as const,
      detail: 'Venda pendente, anulada ou reembolsada: rever individualmente.',
    };
  if (sales.length || benefits.some((b) => b.status === 'consumed'))
    return {
      plan: 'complete' as const,
      detail: 'Concluir apenas; preservar a venda ou o benefício já utilizado.',
    };
  return {
    plan: 'historical' as const,
    detail: 'Concluir e registar faturação anterior, sem novo recebimento.',
  };
}
export function historicalCutoff(value: unknown, now = new Date()) {
  const today = accountDateInput(now, 'Europe/Lisbon');
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value > today
  )
    throw new HistoricalError('Escolha uma data limite até hoje.', 400);
  const cutoff = accountDateTimeToUtc(value, '00:00', 'Europe/Lisbon');
  if (
    !Number.isFinite(cutoff.getTime()) ||
    accountDateInput(cutoff, 'Europe/Lisbon') !== value
  )
    throw new HistoricalError('Data limite inválida.', 400);
  return cutoff;
}
export async function readHistoricalCandidates(
  connection: PoolConnection,
  accountId: string,
  cutoff: Date,
  search: string,
  ids?: string[]
) {
  const filter = ids
    ? `a.id IN (${ids.map(() => '?').join(',')})`
    : `(COALESCE(c.name,'') LIKE ? ESCAPE '!' OR COALESCE(s.name,'') LIKE ? ESCAPE '!')`;
  const term = `%${search.replace(/[!%_]/g, (v) => '!' + v)}%`;
  const [appointments] = await connection.execute<RowDataPacket[]>(
    `SELECT a.*,c.name client_name,s.name service_name FROM clinic_appointments a
    LEFT JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id LEFT JOIN clinic_services s ON s.id=a.service_id AND s.account_id=a.account_id
    WHERE a.account_id=? AND a.status IN ('scheduled','confirmed') AND a.scheduled_end<? AND ${filter} ORDER BY a.id LIMIT 201 FOR UPDATE`,
    [accountId, cutoff, ...(ids || [term, term])]
  );
  if (appointments.length > 200)
    throw new HistoricalError(
      'Existem mais de 200 atendimentos. Restrinja a pesquisa ou a data limite.',
      400
    );
  const candidates: HistoricalCandidate[] = [];
  for (const a of appointments) {
    const [sales] = await connection.execute<RowDataPacket[]>(
      'SELECT id,status,total_amount,paid_amount,balance_due,is_historical,updated_at FROM finance_sales WHERE account_id=? AND appointment_id=? ORDER BY id FOR UPDATE',
      [accountId, a.id]
    );
    const [benefits] = await connection.execute<RowDataPacket[]>(
      'SELECT id,status,consumed_at FROM finance_appointment_benefits WHERE account_id=? AND appointment_id=? ORDER BY id FOR UPDATE',
      [accountId, a.id]
    );
    const revision = createHash('sha256')
      .update(JSON.stringify({ a, sales, benefits }))
      .digest('hex');
    candidates.push({
      id: a.id,
      name: a.client_name || 'Cliente não identificado',
      service: a.service_name || 'Atendimento',
      start: new Date(a.scheduled_start).toISOString(),
      amount: Number(a.price),
      currency: a.currency,
      revision,
      ...historicalPlan(sales, benefits),
    });
  }
  return { candidates, appointments };
}
export async function commitHistoricalAppointments(
  connection: PoolConnection,
  accountId: string,
  userId: string,
  cutoff: Date,
  selected: Array<{ id: string; revision: string }>,
  reason: string
) {
  // Same tenant lock used by other agenda actions; sorted row locks serialize repeats.
  await connection.execute('SELECT id FROM accounts WHERE id=? FOR UPDATE', [
    accountId,
  ]);
  const { candidates, appointments } = await readHistoricalCandidates(
    connection,
    accountId,
    cutoff,
    '',
    selected.map((s) => s.id).sort()
  );
  if (
    candidates.length !== selected.length ||
    candidates.some(
      (c) =>
        c.plan === 'excluded' ||
        selected.find((s) => s.id === c.id)?.revision !== c.revision
    )
  )
    throw new HistoricalError(
      'Um dos registos mudou. Consulte novamente a pré-visualização antes de confirmar.'
    );
  const batchId = randomUUID();
  let historical = 0;
  for (const c of candidates) {
    const a = appointments.find((a) => a.id === c.id)!;
    let saleId: string | null = null;
    if (c.plan === 'historical') {
      saleId = randomUUID();
      await connection.execute(
        `INSERT INTO finance_sales (id,account_id,contact_id,appointment_id,created_by_user_id,status,currency,subtotal,total_amount,paid_amount,balance_due,is_historical,notes,completed_at,created_at)
        VALUES (?,?,?,?,?,'paid',?,?,?,0,0,1,?,?,?)`,
        [
          saleId,
          accountId,
          a.contact_id,
          a.id,
          userId,
          c.currency,
          c.amount,
          c.amount,
          `Faturação anterior autorizada. Sem novo recebimento. Motivo: ${reason}`,
          a.scheduled_end,
          a.scheduled_start,
        ]
      );
      await connection.execute(
        `INSERT INTO finance_sale_items (id,sale_id,account_id,item_type,source_id,name_snapshot,quantity,unit_price,line_total,metadata) VALUES (?,?,?,'service',?,?,1,?,?,?)`,
        [
          randomUUID(),
          saleId,
          accountId,
          a.service_id,
          c.service,
          c.amount,
          c.amount,
          JSON.stringify({
            source: 'historical_appointment_regularization',
            batchId,
          }),
        ]
      );
      historical++;
    }
    await connection.execute(
      "UPDATE clinic_appointments SET status='completed',paid_at=COALESCE(paid_at,?),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?",
      [a.scheduled_end, a.id, accountId]
    );
    await connection.execute(
      "UPDATE clinic_anamnesis_forms SET status='revoked' WHERE appointment_id=? AND account_id=? AND status='pending'",
      [a.id, accountId]
    );
    const metadata = JSON.stringify({
      batchId,
      source: 'attention_queue',
      previous_status: a.status,
      new_status: 'completed',
      plan: c.plan,
      saleId,
      no_cash_movement: true,
      no_customer_notification: true,
    });
    await connection.execute(
      "INSERT INTO finance_audit_events (id,account_id,entity_type,entity_id,action,actor_user_id,reason,metadata) VALUES (?,?,'appointment',?,'historical_regularization',?,?,?)",
      [randomUUID(), accountId, a.id, userId, reason, metadata]
    );
    await connection.execute(
      "INSERT INTO clinic_agenda_events (id,account_id,user_id,entity_type,entity_id,action,reason,metadata) VALUES (?,?,?,'appointment',?,'status_changed',?,?)",
      [randomUUID(), accountId, userId, a.id, reason, metadata]
    );
  }
  return { completed: candidates.length, historical, batchId };
}

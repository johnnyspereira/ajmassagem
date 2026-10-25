import type { RowDataPacket } from 'mysql2';
import { selectRows } from '@/lib/mysql/db';
import { notifyAccountEvent } from '@/lib/notifications/account-events';
import { loadFinanceToday } from './month-workspace';
import { accountTimeInput } from '@/lib/timezone';

export function operationsAlertPhase(now: Date) {
  const time = accountTimeInput(now, 'Europe/Lisbon');
  if (time >= '23:15') return 'last-call';
  if (time >= '21:30') return 'closing';
  if (time >= '09:00' && time < '12:00') return 'opening';
  return null;
}

/** Invoked by the existing authenticated five-minute scheduler; never changes money or appointment states. */
export async function runDailyOperationsAlerts(now = new Date()) {
  const phase = operationsAlertPhase(now);
  if (!phase) return { checked: 0, notified: 0, failed: 0 };
  const accounts = await selectRows<RowDataPacket[]>(
    `SELECT DISTINCT a.id FROM accounts a JOIN profiles p ON p.account_id=a.id AND p.account_role='owner' WHERE EXISTS(SELECT 1 FROM finance_cash_sessions c WHERE c.account_id=a.id) OR EXISTS(SELECT 1 FROM clinic_appointments ap WHERE ap.account_id=a.id AND ap.scheduled_start>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY)) OR EXISTS(SELECT 1 FROM finance_sales s WHERE s.account_id=a.id AND s.status IN ('open','partially_paid') AND s.balance_due>0)`
  );
  let notified = 0,
    failed = 0;
  for (const account of accounts) {
    try {
      const today = await loadFinanceToday(account.id, now);
      const tasks: string[] = [];
      if (phase === 'opening') {
        const due = await selectRows<RowDataPacket[]>(
          "SELECT s.id,s.sale_number,s.created_at,s.currency,s.balance_due,c.name,c.client_reference FROM finance_sales s LEFT JOIN contacts c ON c.id=s.contact_id AND c.account_id=s.account_id WHERE s.account_id=? AND s.status IN ('open','partially_paid') AND s.balance_due>0 AND COALESCE(s.is_historical,0)=0 ORDER BY s.created_at LIMIT 10",
          [account.id]
        );
        if (due.length > 0)
          tasks.push(
            `Vendas por receber${due.length === 10 ? ' (até 10 mais antigas)' : ''}:\n${due.map((sale) => `${sale.name || 'Consumidor final'}${sale.client_reference ? ` · Ref. ${sale.client_reference}` : ''} · Venda #${sale.sale_number} · ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: sale.currency || 'EUR' }).format(Number(sale.balance_due))} em falta · ${new Date(sale.created_at).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })}\nhttps://jpmassagem.pt/finance?tab=sales#sale-${sale.id}`).join('\n\n')}`
          );
        if (!today.cash && today.hasActivity)
          tasks.push(
            'Há atividade hoje e o caixa está fechado. Abra o caixa antes de receber dinheiro físico.'
          );
        if (today.cash) {
          const opened = new Date(today.cash.opened_at).getTime();
          if (now.getTime() - opened > 18 * 3600000)
            tasks.push(
              'O caixa anterior continua aberto. Confira os valores e feche esse turno.'
            );
        }
      } else {
        if (today.cash)
          tasks.push(
            'O caixa continua aberto. Conte o dinheiro físico e confirme o fecho.'
          );
        if (today.appointments.length)
          tasks.push(
            `${today.appointments.length} atendimento(s) de hoje já terminaram e continuam por concluir. Confirme Concluído, Faltou ou Cancelado na Agenda.`
          );
      }
      if (!tasks.length) continue;
      const result = await notifyAccountEvent({
        accountId: account.id,
        retryWhatsApp: true,
        type: 'daily_operations',
        category: 'finance',
        priority: 'high',
        title:
          phase === 'opening'
            ? 'Começar o dia: verificar caixa'
            : phase === 'last-call'
              ? 'Antes da meia-noite: pendências do dia'
              : 'Fechar o dia: caixa e atendimentos',
        body: tasks.join(' '),
        actionUrl: '/finance',
        dedupeKey: `daily-operations:${today.day}:${phase}`,
        metadata: {
          day: today.day,
          phase,
          pending_appointments: today.appointments.length,
          cash_open: !!today.cash,
        },
        whatsappText: `JP Massagem · ${phase === 'opening' ? 'Começar o dia' : 'Fechar o dia'}\n\n${tasks.join('\n\n')}\n\nAbra o Financeiro para resolver: https://jpmassagem.pt/finance\nAgenda: https://jpmassagem.pt/agenda\n\nHorário: Europe/Lisbon. Nenhum estado ou pagamento foi alterado automaticamente.`,
      });
      if (result.internal > 0) notified++;
      if (result.whatsapp === 'failed' || result.whatsapp === 'not_configured')
        failed++;
    } catch (error) {
      failed++;
      console.error('[daily-operations] alert failed', error);
    }
  }
  return { checked: accounts.length, notified, failed };
}

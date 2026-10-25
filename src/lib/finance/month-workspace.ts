import { accountDateInput, accountDateTimeToUtc } from '@/lib/timezone';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

export function financeMonthRange(month: string, now = new Date()) {
  const selected = month || accountDateInput(now, 'Europe/Lisbon').slice(0, 7);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(selected) ||
    Number(selected.slice(0, 4)) < 2000 ||
    Number(selected.slice(0, 4)) > 2100
  )
    throw new Error('Mês inválido.');
  const [year, number] = selected.split('-').map(Number);
  const next = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  return {
    month: selected,
    start: accountDateTimeToUtc(`${selected}-01`, '00:00', 'Europe/Lisbon'),
    end: accountDateTimeToUtc(next, '00:00', 'Europe/Lisbon'),
  };
}

export async function loadFinanceToday(accountId: string, now = new Date()) {
  const day = accountDateInput(now, 'Europe/Lisbon');
  const start = accountDateTimeToUtc(day, '00:00', 'Europe/Lisbon');
  const end = accountDateTimeToUtc(
    new Date(Date.parse(`${day}T12:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10),
    '00:00',
    'Europe/Lisbon'
  );
  const [cash, appointments, activity] = await Promise.all([
    selectRows<RowDataPacket[]>(
      "SELECT id,opened_at FROM finance_cash_sessions WHERE account_id=? AND status='open' ORDER BY opened_at LIMIT 1",
      [accountId]
    ),
    selectRows<RowDataPacket[]>(
      `SELECT a.id,a.scheduled_start,a.scheduled_end,c.name FROM clinic_appointments a LEFT JOIN contacts c ON c.id=a.contact_id AND c.account_id=a.account_id WHERE a.account_id=? AND a.scheduled_start>=? AND a.scheduled_start<? AND a.scheduled_end<=? AND a.status IN ('scheduled','confirmed') ORDER BY a.scheduled_start LIMIT 100`,
      [accountId, start, end, now]
    ),
    selectRows<RowDataPacket[]>(
      `SELECT (SELECT COUNT(*) FROM clinic_appointments WHERE account_id=? AND scheduled_start>=? AND scheduled_start<? AND status NOT IN ('cancelled','no_show')) appointments,(SELECT COUNT(*) FROM finance_payments WHERE account_id=? AND paid_at>=? AND paid_at<? AND status='confirmed') payments`,
      [accountId, start, end, accountId, start, end]
    ),
  ]);
  return {
    day,
    cash: cash[0] || null,
    appointments,
    hasActivity:
      Number(activity[0]?.appointments || 0) > 0 ||
      Number(activity[0]?.payments || 0) > 0,
  };
}

export async function loadFinanceMonth(
  accountId: string,
  month: string,
  now = new Date()
) {
  const range = financeMonthRange(month, now);
  const [billed, received, due, pending, earlier, lastAlerts, today] =
    await Promise.all([
      selectRows<RowDataPacket[]>(
        `SELECT currency,COALESCE(SUM(total_amount),0) amount,COUNT(*) count FROM finance_sales WHERE account_id=? AND created_at>=? AND created_at<? AND status NOT IN ('voided','refunded') AND COALESCE(is_historical,0)=0 GROUP BY currency`,
        [accountId, range.start, range.end]
      ),
      selectRows<RowDataPacket[]>(
        `SELECT s.currency,COALESCE(SUM(p.amount),0) amount FROM finance_payments p JOIN finance_sales s ON s.id=p.sale_id AND s.account_id=p.account_id WHERE p.account_id=? AND p.paid_at>=? AND p.paid_at<? AND p.status='confirmed' AND COALESCE(s.is_historical,0)=0 GROUP BY s.currency`,
        [accountId, range.start, range.end]
      ),
      selectRows<RowDataPacket[]>(
        `SELECT currency,COALESCE(SUM(balance_due),0) amount,COUNT(*) count FROM finance_sales WHERE account_id=? AND created_at>=? AND created_at<? AND status IN ('open','partially_paid') AND balance_due>0 AND COALESCE(is_historical,0)=0 GROUP BY currency`,
        [accountId, range.start, range.end]
      ),
      selectRows<RowDataPacket[]>(
        `SELECT s.id,s.sale_number,s.created_at,s.currency,s.balance_due,c.name FROM finance_sales s LEFT JOIN contacts c ON c.id=s.contact_id AND c.account_id=s.account_id WHERE s.account_id=? AND s.created_at>=? AND s.created_at<? AND s.status IN ('open','partially_paid') AND s.balance_due>0 AND COALESCE(s.is_historical,0)=0 ORDER BY s.created_at LIMIT 50`,
        [accountId, range.start, range.end]
      ),
      selectRows<RowDataPacket[]>(
        `SELECT s.id,s.sale_number,s.created_at,s.currency,s.balance_due,c.name FROM finance_sales s LEFT JOIN contacts c ON c.id=s.contact_id AND c.account_id=s.account_id WHERE s.account_id=? AND s.created_at<? AND s.status IN ('open','partially_paid') AND s.balance_due>0 AND COALESCE(s.is_historical,0)=0 ORDER BY s.created_at LIMIT 50`,
        [accountId, range.start]
      ),
      selectRows<RowDataPacket[]>(
        "SELECT n.title,n.created_at,JSON_UNQUOTE(JSON_EXTRACT(n.metadata,'$.whatsapp_alert_status')) whatsapp_status FROM notifications n JOIN profiles p ON p.user_id=n.user_id AND p.account_id=n.account_id AND p.account_role='owner' WHERE n.account_id=? AND n.type='daily_operations' ORDER BY n.created_at DESC LIMIT 1",
        [accountId]
      ),
      loadFinanceToday(accountId, now),
    ]);
  return {
    month: range.month,
    billed,
    received,
    due,
    pending,
    earlier,
    lastAlert: lastAlerts[0] || null,
    today,
  };
}

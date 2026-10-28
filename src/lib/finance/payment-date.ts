import { accountDateInput, accountDateTimeToUtc } from '@/lib/timezone';

export function salePaymentTimestamp(
  day: string,
  timeZone = 'Europe/Lisbon',
  now = new Date()
) {
  const today = accountDateInput(now, timeZone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today)
    throw new Error('Escolha uma data de pagamento passada ou atual.');
  const selected = accountDateTimeToUtc(day, '12:00', timeZone);
  if (accountDateInput(selected, timeZone) !== day)
    throw new Error('Data de pagamento inválida.');
  return day === today ? now.toISOString() : selected.toISOString();
}

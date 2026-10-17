import { isValid } from 'date-fns';
import { accountDateInput, accountTimeInput } from '@/lib/timezone';

export function conversationTime(
  value?: string | null,
  now = new Date(),
  timeZone?: string | null
): string {
  if (!value) return '';
  const date = new Date(value);
  if (!isValid(date)) return '';
  const day = accountDateInput(date, timeZone);
  if (day === accountDateInput(now, timeZone))
    return accountTimeInput(date, timeZone);
  // Compare against the supplied clock so tests and previews remain stable.
  const localDay = accountDateInput(now, timeZone);
  const yesterday = new Date(`${localDay}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return 'Ontem';
  const [year, month, dateNumber] = day.split('-');
  return `${dateNumber}/${month}${year === localDay.slice(0, 4) ? '' : `/${year.slice(2)}`}`;
}

import { format, isSameDay, isValid } from 'date-fns';

export function conversationTime(
  value?: string | null,
  now = new Date()
): string {
  if (!value) return '';
  const date = new Date(value);
  if (!isValid(date)) return '';
  if (isSameDay(date, now)) return format(date, 'HH:mm');
  // Compare against the supplied clock so tests and previews remain stable.
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Ontem';
  return format(
    date,
    date.getFullYear() === now.getFullYear() ? 'dd/MM' : 'dd/MM/yy'
  );
}

import { reminderStart } from './reminder-schedule';

const lisbonDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Exclusive deadline: the next midnight in Lisbon, including daylight saving changes. */
export function renewalDeadline(now: Date = new Date()) {
  const day = lisbonDay.format(now);
  let lower = now.getTime(),
    upper = lower + 27 * 60 * 60 * 1000;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (lisbonDay.format(middle) === day) lower = middle;
    else upper = middle;
  }
  return new Date(upper);
}

export function effectiveRenewalDeadline(
  sentAt: Date | string,
  expiresAt: Date | string
) {
  const date = (value: Date | string) =>
    value instanceof Date ? value : new Date(reminderStart(value));
  return new Date(
    Math.min(renewalDeadline(date(sentAt)).getTime(), date(expiresAt).getTime())
  );
}

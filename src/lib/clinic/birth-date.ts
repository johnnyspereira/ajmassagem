/** A birthday is a calendar date, not a local-time timestamp. MySQL returns Date objects on the server. */
export function normalizeBirthDate(value: unknown): string | null {
  const text =
    value instanceof Date
      ? Number.isFinite(value.getTime())
        ? value.toISOString().slice(0, 10)
        : ''
      : typeof value === 'string'
        ? value.trim().slice(0, 10)
        : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000')) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === text
    ? text
    : null;
}

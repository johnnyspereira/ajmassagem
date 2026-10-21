/** Calculate from the catalogue on every change, avoiding cumulative rounding. */
export function proportionalSessionPrice(
  price: number,
  baseMinutes: number,
  minutes: number
) {
  if (!Number.isFinite(price) || price < 0) return 0;
  if (
    !Number.isFinite(baseMinutes) ||
    baseMinutes <= 0 ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  )
    return Math.round(price * 100) / 100;
  return (
    Math.round(((price * minutes) / baseMinutes + Number.EPSILON) * 100) / 100
  );
}

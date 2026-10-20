/** MySQL dates without an offset represent UTC, including in browsers outside Lisbon. */
export function reminderStart(value: string) {
  return Date.parse(
    /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value
  );
}

export function isUpcomingReminder(
  appointment: { status: string; scheduled_start: string },
  now: number
) {
  return (
    ['scheduled', 'confirmed'].includes(appointment.status) &&
    reminderStart(appointment.scheduled_start) > now
  );
}

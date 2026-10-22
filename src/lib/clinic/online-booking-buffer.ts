import { reminderStart } from './reminder-schedule';
export const ONLINE_BOOKING_BUFFER_MS = 60 * 60_000;
export function onlineBookingWindow(start: string | Date, end: string | Date) {
  const timestamp = (value: string | Date) =>
    value instanceof Date ? value.getTime() : reminderStart(value);
  return {
    start: new Date(timestamp(start) - ONLINE_BOOKING_BUFFER_MS),
    end: new Date(timestamp(end) + ONLINE_BOOKING_BUFFER_MS),
  };
}
export function onlineBusyAppointments<
  T extends { status: string; scheduled_start: string; scheduled_end: string },
>(items: T[]) {
  return items
    .filter(
      (item) => !['cancelled', 'canceled', 'no_show'].includes(item.status)
    )
    .map((item) => {
      const window = onlineBookingWindow(
        item.scheduled_start,
        item.scheduled_end
      );
      return {
        ...item,
        scheduled_start: window.start.toISOString(),
        scheduled_end: window.end.toISOString(),
      };
    });
}

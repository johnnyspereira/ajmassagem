import { expect, it } from 'vitest';
import {
  onlineBookingWindow,
  onlineBusyAppointments,
} from './online-booking-buffer';
it('reserves one hour before the start and after the end, with UTC MySQL dates', () => {
  const result = onlineBookingWindow(
    '2026-10-22 12:00:00',
    '2026-10-22 12:50:00'
  );
  expect(result.start.toISOString()).toBe('2026-10-22T11:00:00.000Z');
  expect(result.end.toISOString()).toBe('2026-10-22T13:50:00.000Z');
});
it('handles midnight and daylight saving as elapsed hours', () => {
  const result = onlineBookingWindow(
    '2026-10-25T00:30:00Z',
    '2026-10-25T01:20:00Z'
  );
  expect(result.start.toISOString()).toBe('2026-10-24T23:30:00.000Z');
  expect(result.end.toISOString()).toBe('2026-10-25T02:20:00.000Z');
});
it('keeps completed appointments buffered but frees cancelled and missed sessions', () => {
  const make = (status: string) => ({
    status,
    scheduled_start: '2026-10-22T12:00:00Z',
    scheduled_end: '2026-10-22T12:50:00Z',
  });
  const original = [
    make('scheduled'),
    make('completed'),
    make('cancelled'),
    make('no_show'),
  ];
  expect(onlineBusyAppointments(original).map((item) => item.status)).toEqual([
    'scheduled',
    'completed',
  ]);
  expect(original[0].scheduled_start).toBe('2026-10-22T12:00:00Z');
});
it('blocks 11:00 and 13:00 around noon, and 13:00 and 15:00 around 14:00', () => {
  const busy = onlineBusyAppointments([
    {
      status: 'confirmed',
      scheduled_start: '2026-10-22T12:00:00Z',
      scheduled_end: '2026-10-22T12:50:00Z',
    },
    {
      status: 'scheduled',
      scheduled_start: '2026-10-22T14:00:00Z',
      scheduled_end: '2026-10-22T14:50:00Z',
    },
  ]);
  const collides = (start: string, end: string) =>
    busy.some(
      (item) =>
        Date.parse(item.scheduled_start) < Date.parse(end) &&
        Date.parse(item.scheduled_end) > Date.parse(start)
    );
  for (const hour of ['11', '13', '15'])
    expect(
      collides(`2026-10-22T${hour}:00:00Z`, `2026-10-22T${hour}:50:00Z`)
    ).toBe(true);
  expect(collides('2026-10-22T10:10:00Z', '2026-10-22T11:00:00Z')).toBe(false);
  expect(collides('2026-10-22T15:50:00Z', '2026-10-22T16:40:00Z')).toBe(false);
});

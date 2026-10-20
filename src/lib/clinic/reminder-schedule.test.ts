import { expect, it } from 'vitest';
import { isUpcomingReminder, reminderStart } from './reminder-schedule';

const now = Date.parse('2026-10-20T18:41:00Z');
it('excludes previous days, elapsed sessions today and the exact start instant', () => {
  for (const scheduled_start of [
    '2026-10-14 13:30:00',
    '2026-10-20 17:00:00',
    '2026-10-20T18:41:00Z',
  ]) {
    expect(
      isUpcomingReminder({ status: 'scheduled', scheduled_start }, now)
    ).toBe(false);
  }
});
it('excludes inactive sessions even when they have a future date', () => {
  for (const status of ['cancelled', 'completed', 'no_show']) {
    expect(
      isUpcomingReminder(
        { status, scheduled_start: '2026-10-21T12:00:00Z' },
        now
      )
    ).toBe(false);
  }
});
it('keeps active future sessions and interprets MySQL timestamps as UTC', () => {
  expect(reminderStart('2026-10-20 19:00:00')).toBe(
    Date.parse('2026-10-20T19:00:00Z')
  );
  expect(
    isUpcomingReminder(
      { status: 'confirmed', scheduled_start: '2026-10-20 19:00:00' },
      now
    )
  ).toBe(true);
  expect(
    isUpcomingReminder({ status: 'scheduled', scheduled_start: 'invalid' }, now)
  ).toBe(false);
});

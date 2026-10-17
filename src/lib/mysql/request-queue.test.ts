import { describe, expect, it } from 'vitest';
import { createRequestQueue } from './request-queue';

describe('cPanel request queue', () => {
  it('caps concurrent reads, preserves order, and releases failed slots', async () => {
    const schedule = createRequestQueue(2);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const tasks = Array.from({ length: 9 }, (_, index) =>
      schedule(async () => {
        started.push(index);
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 2));
          if (index === 3) throw new Error('offline');
          return index;
        } finally {
          active--;
        }
      })
    );
    const results = await Promise.allSettled(tasks);
    expect(peak).toBe(2);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    expect(await schedule(async () => 'recovered')).toBe('recovered');
  });
});

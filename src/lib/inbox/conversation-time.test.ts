import { describe, expect, it } from 'vitest';
import { conversationTime } from './conversation-time';
describe('compact conversation timestamps', () => {
  it('keeps timestamps short so names retain their column', () => {
    const now = new Date('2026-10-17T15:00:00Z');
    expect(
      conversationTime('2026-10-17T14:10:00Z', now, 'Europe/Lisbon')
    ).toBe('15:10');
    expect(
      conversationTime('2026-10-16T09:00:00Z', now, 'Europe/Lisbon')
    ).toBe('Ontem');
    expect(
      conversationTime('2026-10-12T09:00:00Z', now, 'Europe/Lisbon')
    ).toBe('12/10');
    expect(conversationTime('invalid', now)).toBe('');
  });
});

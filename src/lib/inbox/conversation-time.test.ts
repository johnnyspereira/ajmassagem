import { describe, expect, it } from 'vitest';
import { conversationTime } from './conversation-time';
describe('compact conversation timestamps', () => {
  it('keeps timestamps short so names retain their column', () => {
    const now = new Date(2026, 9, 17, 16, 0);
    expect(
      conversationTime(new Date(2026, 9, 17, 15, 10).toISOString(), now)
    ).toBe('15:10');
    expect(
      conversationTime(new Date(2026, 9, 16, 10, 0).toISOString(), now)
    ).toBe('Ontem');
    expect(
      conversationTime(new Date(2026, 9, 12, 10, 0).toISOString(), now)
    ).toBe('12/10');
    expect(conversationTime('invalid', now)).toBe('');
  });
});

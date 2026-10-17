import { describe, expect, it } from 'vitest';
import { notificationGroupKey } from './group-key';
const base = { id: 'a', user_id: 'u', type: 'new_message_received' as const };
describe('notification grouping', () => {
  it('groups repeated messages in one conversation', () => {
    expect(notificationGroupKey({ ...base, conversation_id: 'c' })).toBe(
      notificationGroupKey({ ...base, id: 'b', conversation_id: 'c' })
    );
  });
  it('keeps different clients and event types apart', () => {
    expect(notificationGroupKey({ ...base, contact_id: 'one' })).not.toBe(
      notificationGroupKey({ ...base, contact_id: 'two' })
    );
    expect(notificationGroupKey({ ...base, conversation_id: 'c' })).not.toBe(
      notificationGroupKey({
        ...base,
        conversation_id: 'c',
        type: 'conversation_assigned',
      })
    );
  });
  it('does not merge unrelated alerts with no known target', () => {
    expect(notificationGroupKey(base)).not.toBe(
      notificationGroupKey({ ...base, id: 'b' })
    );
  });
  it('keeps assignment histories scoped to the recipient', () => {
    expect(
      notificationGroupKey({
        ...base,
        type: 'conversation_assigned',
        conversation_id: 'c',
      })
    ).not.toBe(
      notificationGroupKey({
        ...base,
        type: 'conversation_assigned',
        conversation_id: 'c',
        user_id: 'other',
      })
    );
  });
});

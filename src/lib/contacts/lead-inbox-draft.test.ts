import { describe, expect, it } from 'vitest';
import { storeLeadInboxDraft, takeLeadInboxDraft } from './lead-inbox-draft';
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
};
describe('Lead draft handoff', () => {
  it('loads the prepared message once, only for the right account and conversation', () => {
    const s = storage();
    storeLeadInboxDraft(s, 'a', 'c', 'Olá, João!', 1000);
    expect(takeLeadInboxDraft(s, 'b', 'c', 1100)).toBeNull();
    expect(takeLeadInboxDraft(s, 'a', 'other', 1100)).toBeNull();
    expect(takeLeadInboxDraft(s, 'a', 'c', 1100)).toBe('Olá, João!');
    expect(takeLeadInboxDraft(s, 'a', 'c', 1100)).toBeNull();
  });
  it('discards expired, invalid and oversized drafts', () => {
    const s = storage();
    storeLeadInboxDraft(s, 'a', 'c', 'Olá!', 1000);
    expect(takeLeadInboxDraft(s, 'a', 'c', 31 * 60000)).toBeNull();
    s.setItem('crm:lead-draft:a:c', 'invalid');
    expect(takeLeadInboxDraft(s, 'a', 'c')).toBeNull();
    expect(() => storeLeadInboxDraft(s, 'a', 'c', 'x'.repeat(4001))).toThrow();
  });
});

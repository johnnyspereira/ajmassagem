export interface LeadInboxDraft {
  accountId: string;
  conversationId: string;
  text: string;
  createdAt: number;
}
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const draftKey = (account: string, conversation: string) =>
  `crm:lead-draft:${account}:${conversation}`;
export function storeLeadInboxDraft(
  storage: DraftStorage,
  accountId: string,
  conversationId: string,
  text: string,
  now = Date.now()
) {
  if (!text.trim() || text.length > 4000)
    throw new Error('Reveja o texto da mensagem (máximo 4.000 caracteres).');
  storage.setItem(
    draftKey(accountId, conversationId),
    JSON.stringify({ accountId, conversationId, text, createdAt: now })
  );
}
export function takeLeadInboxDraft(
  storage: DraftStorage,
  accountId: string,
  conversationId: string,
  now = Date.now()
): string | null {
  const key = draftKey(accountId, conversationId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  storage.removeItem(key);
  try {
    const value = JSON.parse(raw) as LeadInboxDraft;
    return value.accountId === accountId &&
      value.conversationId === conversationId &&
      typeof value.text === 'string' &&
      value.text.trim() &&
      value.text.length <= 4000 &&
      Number.isFinite(value.createdAt) &&
      now - value.createdAt <= 30 * 60000 &&
      now >= value.createdAt - 60000
      ? value.text
      : null;
  } catch {
    return null;
  }
}

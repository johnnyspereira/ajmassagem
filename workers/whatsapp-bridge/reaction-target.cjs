/** Resolve old numeric/LID message identifiers without reacting to a different message. */
async function findReactionTarget(client, { messageId, phone, fromMe }) {
  const parts = messageId.split('_');
  const rawId = parts.length >= 3 ? parts[2] : messageId;
  const direction = parts[0] === 'true' || parts[0] === 'false' ? parts[0] : String(fromMe === true);
  async function lookup(id) {
    try { return await client.getMessageById(id); }
    catch (error) {
      if (/detached|Target closed|Session closed|Execution context/i.test(error?.message || '')) throw error;
      return null;
    }
  }
  const original = await lookup(messageId);
  if (original) return original;
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || !rawId || rawId.includes('@')) return null;
  const registered = await client.getNumberId(digits).catch(() => null);
  const jids = [...new Set([`${digits}@c.us`, registered?._serialized].filter(Boolean))];
  for (const jid of jids) {
    const found = await lookup(`${direction}_${jid}_${rawId}`);
    if (found) return found;
  }
  // A reconnected browser may not yet have the conversation's messages loaded.
  for (const jid of jids) {
    const chat = await client.getChatById(jid).catch(() => null);
    if (!chat) continue;
    const recent = await chat.fetchMessages({ limit: 100 }).catch(() => []);
    const found = recent.find(message => message.id?.id === rawId && String(message.fromMe ?? message.id?.fromMe) === direction);
    if (found) return found;
  }
  return null;
}
module.exports = { findReactionTarget };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findReactionTarget } = require('./reaction-target.cjs');
test('uses the exact target when already loaded', async () => {
  const target = { id: { id: 'ABC' } };
  const client = { getMessageById: async () => target };
  assert.equal(await findReactionTarget(client, { messageId: 'false_123@c.us_ABC' }), target);
});
test('resolves a legacy LID to the same message on the numeric contact JID', async () => {
  const target = { id: { id: 'ABC' } };
  const client = { getMessageById: async id => id === 'false_351900000000@c.us_ABC' ? target : null, getNumberId: async () => null };
  assert.equal(await findReactionTarget(client, { messageId: 'false_999@lid_ABC', phone: '+351900000000' }), target);
});
test('loads recent messages after reconnection and never substitutes another message or direction', async () => {
  const correct = { id: { id: 'ABC' }, fromMe: false };
  const client = { getMessageById: async () => null, getNumberId: async () => null, getChatById: async () => ({ fetchMessages: async ({ limit }) => { assert.equal(limit, 100); return [{ id: { id: 'OTHER' } }, { id: { id: 'ABC' }, fromMe: true }, correct]; } }) };
  assert.equal(await findReactionTarget(client, { messageId: 'ABC', phone: '+351900000000', fromMe: false }), correct);
});
test('returns no target for unavailable history; does not claim success', async () => {
  const client = { getMessageById: async () => null, getNumberId: async () => null, getChatById: async () => ({ fetchMessages: async () => [] }) };
  assert.equal(await findReactionTarget(client, { messageId: 'ABC', phone: '+351900000000' }), null);
});
test('browser errors remain visible to session recovery', async () => {
  await assert.rejects(findReactionTarget({ getMessageById: async () => { throw new Error('Attempted to use detached Frame'); } }, { messageId: 'ABC' }), /detached/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isBrowserSessionError } = require('./browser-health.cjs');
test('detects invalid browser sessions without restarting on ordinary delivery errors', () => {
  for (const message of ['Attempted to use detached Frame 123', 'Execution context was destroyed', 'Protocol error: Target closed', 'Session closed. Most likely the page has been closed.']) assert.equal(isBrowserSessionError(new Error(message)), true);
  for (const message of ['HTTP 508', 'Invalid phone number', 'Unauthorized', 'Media not available']) assert.equal(isBrowserSessionError(new Error(message)), false);
});

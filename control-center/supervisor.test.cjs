const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function supervisor(alive, rootRetryWorks = false) {
  let retried = false;
  const sandbox = { module: { exports: {} }, __dirname, process, console, setTimeout, fetch, AbortSignal, require(name) {
    if (name === 'node:child_process') return { execFile(file, args, options, callback) {
      if (file === 'taskkill.exe') {
        if (!args.includes('/T')) { retried = true; if(rootRetryWorks) return callback(null, '', ''); }
        callback(new Error('not found'), '', 'not found');
      } else callback(null, alive && !(retried && rootRetryWorks) ? 'alive' : '', '');
    }};
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'supervisor.cjs'), 'utf8'), sandbox);
  const s = new sandbox.module.exports.Supervisor();
  s.serviceState = async () => ({ pids: [9608] });
  s.event = () => {};
  return s;
}
test('a vanished PID does not block restart', async () => {
  const s = supervisor(false);
  let started = false;
  s.start = async () => { started = true; return { changed: true }; };
  await s.restart('aiTunnel');
  assert.equal(started, true);
});
test('a failure to stop a live PID is still reported', async () => {
  await assert.rejects(supervisor(true).stop('aiTunnel'), /continua ativo/);
});
test('a stale child tree falls back to the parent PID and verifies shutdown', async () => {
  assert.equal((await supervisor(true, true).stop('aiTunnel')).changed, true);
});

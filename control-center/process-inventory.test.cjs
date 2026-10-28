const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProcessInventory, listeningPorts, configMatches } = require('./process-inventory.cjs');

test('finds listeners on IPv4 and IPv6 without confusing established connections', () => {
  const ports = listeningPorts(' TCP 127.0.0.1:4100 0.0.0.0:0 LISTENING 42\n TCP [::]:3002 [::]:0 LISTENING 77\n TCP 127.0.0.1:9000 127.0.0.1:4100 ESTABLISHED 88');
  assert.equal(ports.get(4100), 42);
  assert.equal(ports.get(3002), 77);
  assert.equal(ports.has(9000), false);
});

test('tunnels match the exact config path, including spaces and Windows case', () => {
  const expected = 'C:\\Users\\Johnny Pereira\\.cloudflared\\config.yml';
  assert.equal(configMatches('cloudflared --config "C:/Users/Johnny Pereira/.cloudflared/CONFIG.yml" tunnel run', expected), true);
  assert.equal(configMatches('cloudflared --config "C:/Users/Johnny Pereira/.cloudflared/other-config.yml" tunnel run', expected), false);
  assert.equal(configMatches('cloudflared --config "D:/other/config.yml" tunnel run', expected), false);
});

test('concurrent cards share one discovery; CIM metadata is only read every 30 seconds', async () => {
  let now = 100_000;
  const calls = [];
  const inventory = new ProcessInventory(async (file, args) => {
    calls.push(file);
    if (file === 'netstat.exe') return 'TCP 127.0.0.1:4100 0.0.0.0:0 LISTENING 42';
    assert.equal(args[2], '-EncodedCommand');
    assert.match(Buffer.from(args[3], 'base64').toString('utf16le'), /Get-CimInstance/);
    return '[]';
  }, () => now);
  await Promise.all(Array.from({ length: 12 }, () => inventory.read()));
  assert.equal(calls.length, 2);
  await inventory.read();
  assert.equal(calls.length, 2);
  now += 10_001;
  await inventory.read();
  assert.equal(calls.filter(c => c === 'powershell.exe').length, 1);
  now += 20_001;
  await inventory.read();
  assert.equal(calls.filter(c => c === 'powershell.exe').length, 2);
});

test('failed CIM discovery backs off, and manual actions never use unverifiable metadata', async () => {
  let now = 100_000, calls = 0;
  const inventory = new ProcessInventory(async file => {
    if (file === 'netstat.exe') return '';
    calls++;
    throw new Error('timeout');
  }, () => now);
  assert.equal((await inventory.read()).metadataAvailable, false);
  now += 10_001;
  await inventory.read();
  assert.equal(calls, 1);
  await assert.rejects(inventory.read(true), /verificar os processos/);
  assert.equal(calls, 2);
});

test('a failed native query does not become an unhandled rejection while CIM runs', async () => {
  const inventory = new ProcessInventory(async file => {
    if (file === 'netstat.exe') throw new Error('netstat unavailable');
    await new Promise(resolve => setTimeout(resolve, 20));
    return '[]';
  });
  await assert.rejects(inventory.read(), /netstat unavailable/);
});

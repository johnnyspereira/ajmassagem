const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

function matchesProfile(child, profile) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) return false;
  if (!/^(chrome|chromium)(\.exe)?$/i.test(path.basename(child.spawnfile || ''))) return false;
  const normalize = value => {const resolved=path.resolve(value).replaceAll('\\', '/');return process.platform==='win32'?resolved.toLowerCase():resolved;};
  return (child.spawnargs || []).some(arg => arg.startsWith('--user-data-dir=') && normalize(arg.slice('--user-data-dir='.length).replace(/^"|"$/g,'')) === normalize(profile));
}

async function forceStop(child) {
  if (process.platform === 'win32') {
    await run('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000});
  } else child.kill('SIGKILL');
}

async function closeManagedClient(instance, profile, { graceMs=8000, terminate=forceStop } = {}) {
  if (!instance) return;
  const child = instance.pupBrowser?.process?.();
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(()=>instance.destroy?.()).catch(()=>{}),
      new Promise(resolve=>{timer=setTimeout(resolve,graceMs);}),
    ]);
  } finally { clearTimeout(timer); }
  // Only the browser created by this exact client, for this exact profile.
  // Never scan/kill personal Chrome windows or remove authentication files.
  if (matchesProfile(child,profile) && child.exitCode === null && child.signalCode === null) {
    try { await terminate(child); }
    catch(error) { if(child.exitCode === null && child.signalCode === null) throw error; }
  }
}
module.exports = { closeManagedClient, matchesProfile };

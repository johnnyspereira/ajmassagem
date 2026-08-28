import { spawn } from 'node:child_process';
import process from 'node:process';

if (process.env.CPANEL_DEPLOY !== 'true') {
  console.log('skip cPanel deployment (CPANEL_DEPLOY is not true)');
  process.exit(0);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`));
    });
  });
}

console.log('cPanel: applying MySQL migrations...');
await run(process.execPath, ['scripts/mysql-migrate.mjs']);

console.log('cPanel: building the Next.js production application...');
await run(process.execPath, [
  'node_modules/next/dist/bin/next',
  'build',
  '--webpack',
]);

console.log('cPanel deployment completed successfully.');

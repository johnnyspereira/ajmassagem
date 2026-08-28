const { execFileSync } = require('node:child_process');
const path = require('node:path');

try {
  console.log('cPanel: applying pending MySQL migrations...');
  execFileSync(process.execPath, [path.join(__dirname, 'scripts/mysql-migrate.mjs')], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });
} catch (error) {
  console.error('cPanel: MySQL migration failed. Application was not started.');
  process.exit(typeof error.status === 'number' ? error.status : 1);
}

require('./next-server.js');

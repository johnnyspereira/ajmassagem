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
  console.error('cPanel: MySQL migration failed. Starting the application with the existing schema.');
}

require('./next-server.js');

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const bundledStatic = path.join(__dirname, 'runtime-static');
const nextStatic = path.join(__dirname, '.next', 'static');

try {
  if (fs.existsSync(bundledStatic)) {
    fs.mkdirSync(nextStatic, { recursive: true });
    fs.cpSync(bundledStatic, nextStatic, { recursive: true, force: true });
    console.log('cPanel: Next static assets restored.');
  }
} catch (error) {
  console.error('cPanel: failed to restore Next static assets.', error);
}

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

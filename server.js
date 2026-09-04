const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Some Node.js Selector installations display application variables
// in cPanel but fail to pass them to Passenger after a deployment.
// A local .env (never committed) is an explicit, secure fallback.
// Existing process variables always take precedence.
const envFile = path.join(__dirname, '.env');
try {
  if (fs.existsSync(envFile)) {
    for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
    console.log('cPanel: local environment fallback loaded.');
  }
} catch (error) {
  console.error('cPanel: unable to load local environment fallback.', error);
}

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

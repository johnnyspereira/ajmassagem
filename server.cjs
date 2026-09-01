const { createServer } = require('node:http');
const next = require('next');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server;
let financeReminderTimer;

function startFinanceReminderScheduler() {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret) {
    console.warn(
      'Finance reminders disabled: AUTOMATION_CRON_SECRET is not configured.'
    );
    return;
  }

  const run = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/finance/reminders/process`,
        { headers: { 'x-cron-secret': secret } }
      );
      if (!response.ok) {
        console.error(
          `Finance reminder cycle failed (${response.status}):`,
          await response.text()
        );
      }
    } catch (error) {
      console.error('Finance reminder cycle failed:', error);
    }
  };

  setTimeout(() => void run(), 15_000).unref();
  financeReminderTimer = setInterval(() => void run(), 5 * 60_000);
  financeReminderTimer.unref();
  console.log('Finance reminder scheduler active (every 5 minutes).');
}

async function start() {
  await app.prepare();

  server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error('Request failed:', error);
      if (!response.headersSent) response.statusCode = 500;
      response.end('Internal server error');
    });
  });

  server.listen(port, hostname, () => {
    console.log(`CRM running on http://${hostname}:${port}`);
    startFinanceReminderScheduler();
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Closing CRM server.`);
  if (financeReminderTimer) clearInterval(financeReminderTimer);
  if (!server) process.exit(0);

  server.close(async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((error) => {
  console.error('CRM startup failed:', error);
  process.exit(1);
});

const { createServer } = require('node:http');
const next = require('next');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server;

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
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Closing CRM server.`);
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

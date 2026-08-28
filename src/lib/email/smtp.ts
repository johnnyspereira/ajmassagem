import 'server-only';

import nodemailer from 'nodemailer';

function defaultSender() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
  try {
    return `no-reply@${new URL(configuredUrl).hostname}`;
  } catch {
    return 'no-reply@localhost';
  }
}

export async function sendLocalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const transports = [];
  if (host) {
    transports.push({
      name: 'smtp',
      client: nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }),
    });
  }
  transports.push({
    name: 'sendmail',
    client: nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail',
    }),
  });

  const errors: string[] = [];
  for (const transport of transports) {
    try {
      const result = await transport.client.sendMail({
        from: process.env.SMTP_FROM || user || defaultSender(),
        ...input,
      });
      console.info(
        `[email] delivered using ${transport.name}:`,
        result.messageId
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${transport.name}: ${message}`);
      console.warn(`[email] ${transport.name} delivery failed:`, message);
    }
  }

  throw new Error(`Email delivery failed (${errors.join('; ')}).`);
}

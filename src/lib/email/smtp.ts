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

function senderAddress(user?: string) {
  const configured = process.env.SMTP_FROM?.trim();
  if (configured?.includes('@')) return configured;
  const address = user || defaultSender();
  if (!configured) return address;
  const displayName = configured.replace(/["\r\n<>]/g, '').trim();
  return displayName ? `"${displayName}" <${address}>` : address;
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
  } else {
    transports.push({
      name: 'sendmail',
      client: nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail',
      }),
    });
  }

  const errors: string[] = [];
  for (const transport of transports) {
    try {
      const result = await transport.client.sendMail({
        from: senderAddress(user),
        ...input,
      });
      if (transport.name === 'smtp') {
        const accepted = Array.isArray(result.accepted) ? result.accepted : [];
        const rejected = Array.isArray(result.rejected) ? result.rejected : [];
        if (!accepted.length || rejected.length) {
          throw new Error(
            `SMTP did not accept every recipient (accepted: ${accepted.length}, rejected: ${rejected.length}).`
          );
        }
      }
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

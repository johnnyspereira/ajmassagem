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
  const transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: user && pass ? { user, pass } : undefined,
      })
    : nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: process.env.SENDMAIL_PATH || '/usr/sbin/sendmail',
      });

  await transport.sendMail({
    from: process.env.SMTP_FROM || user || defaultSender(),
    ...input,
  });
}

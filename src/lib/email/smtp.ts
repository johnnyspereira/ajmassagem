import 'server-only';

import nodemailer from 'nodemailer';

export async function sendLocalEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const host = process.env.SMTP_HOST; const user = process.env.SMTP_USER; const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) throw new Error('Local SMTP is not configured.');
  const transport = nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== 'false', auth: { user, pass } });
  await transport.sendMail({ from: process.env.SMTP_FROM || user, ...input });
}

import { afterEach, describe, expect, it } from 'vitest';

import { remoteWhatsAppWorker } from './remote-worker';

const original = {
  mode: process.env.WHATSAPP_MODE,
  url: process.env.WHATSAPP_WORKER_URL,
  secret: process.env.WHATSAPP_WORKER_SECRET,
};

afterEach(() => {
  restore('WHATSAPP_MODE', original.mode);
  restore('WHATSAPP_WORKER_URL', original.url);
  restore('WHATSAPP_WORKER_SECRET', original.secret);
});

describe('remoteWhatsAppWorker.enabled', () => {
  it('uses runtime remote_worker mode', () => {
    process.env.WHATSAPP_MODE = 'remote_worker';
    expect(remoteWhatsAppWorker.enabled()).toBe(true);
  });

  it('recognizes a complete worker configuration when mode was lost', () => {
    delete process.env.WHATSAPP_MODE;
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(true);
  });

  it('does not override an explicit local mode', () => {
    process.env.WHATSAPP_MODE = 'local_qr';
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(false);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

import { describe, expect, it, vi } from 'vitest';
// The worker is CommonJS and runs independently of the Next.js application.
import { createRequire } from 'node:module';
const { createIncomingDelivery } = createRequire(import.meta.url)(
  '../../../workers/whatsapp-bridge/incoming-delivery.cjs'
);
describe('incoming WhatsApp delivery', () => {
  it('retries a first message whose phone identity is not ready and coalesces events', async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ duplicate: false });
    const onError = vi.fn();
    const wait = vi.fn(async () => {});
    const deliver = createIncomingDelivery({
      persist,
      getId: () => 'new-contact',
      isMedia: () => false,
      onError,
      wait,
    });
    await Promise.all([deliver({}), deliver({})]);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });
  it('does not need a manual sync after a transient callback error', async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ duplicate: true });
    const onError = vi.fn();
    await createIncomingDelivery({
      persist,
      getId: () => 'message',
      isMedia: () => false,
      onError,
      wait: async () => {},
    })({});
    expect(persist).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });
  it('continues until media is saved and reports exhausted attempts', async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce({ duplicate: false, mediaSaved: false })
      .mockResolvedValue({ duplicate: true, mediaSaved: true });
    const onError = vi.fn();
    await createIncomingDelivery({
      persist,
      getId: () => 'media',
      isMedia: () => true,
      onError,
      wait: async () => {},
    })({});
    expect(persist).toHaveBeenCalledTimes(2);
    const missing = vi.fn().mockResolvedValue(null);
    await createIncomingDelivery({
      persist: missing,
      getId: () => 'missing',
      isMedia: () => false,
      onError,
      wait: async () => {},
    })({});
    expect(missing).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledOnce();
  });
});

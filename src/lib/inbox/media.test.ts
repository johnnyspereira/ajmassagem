import { describe, it, expect } from 'vitest';
import { mediaSources, withMediaSlot } from './media';
describe('inbox media sources', () => {
  it('limits concurrent attachment loads and skips cancelled queued work', async () => {
    let active = 0,
      max = 0,
      calls = 0;
    const controller = new AbortController();
    const cancelled = new AbortController();
    cancelled.abort();
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        withMediaSlot(
          index === 9 ? cancelled.signal : controller.signal,
          async () => {
            calls++;
            active++;
            max = Math.max(max, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
          }
        )
      )
    );
    expect(max).toBe(3);
    expect(calls).toBe(9);
  });
  it('recovers missing previews through the authenticated bridge', () => {
    expect(mediaSources({ message_id: 'true_351@c.us_abc' })).toEqual([
      '/api/whatsapp/bridge-media/true_351%40c.us_abc',
    ]);
  });
  it('keeps uploaded media first and removes duplicate bridge requests', () => {
    expect(
      mediaSources({ media_url: '/uploads/photo.jpg', message_id: 'abc' })
    ).toEqual(['/uploads/photo.jpg', '/api/whatsapp/bridge-media/abc']);
    expect(
      mediaSources({
        media_url: '/api/whatsapp/bridge-media/abc',
        message_id: 'abc',
      })
    ).toHaveLength(1);
  });
  it('rejects executable and encrypted media URLs', () => {
    expect(mediaSources({ media_url: 'javascript:alert(1)' })).toEqual([]);
    expect(
      mediaSources({
        media_url: 'https://mmg.whatsapp.net/file.enc?token=abc',
        message_id: 'abc',
      })
    ).toEqual(['/api/whatsapp/bridge-media/abc']);
  });
});

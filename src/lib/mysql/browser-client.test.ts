import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMysqlBrowserClient } from './browser-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const success = () =>
  Response.json({ data: [{ id: 'a' }], error: null, count: null, status: 200 });
describe('shared hosting query failures', () => {
  it('sees newly inserted conversations beyond the first 500 stored rows', async () => {
    vi.useFakeTimers();
    let added = false;
    const oldRows = Array.from({ length: 500 }, (_, index) => ({
      id: `old-${index}`,
    }));
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const query = JSON.parse(init.body as string);
      const sorted =
        query.orders?.[0]?.column === 'updated_at' &&
        query.orders[0].ascending === false;
      return Response.json({
        data:
          added && sorted
            ? [{ id: 'new-conversation' }, ...oldRows.slice(0, 499)]
            : oldRows,
        error: null,
      });
    });
    vi.stubGlobal('fetch', fetch);
    const events = vi.fn();
    const client = createMysqlBrowserClient();
    const channel = client
      .channel('new-conversations')
      .on('postgres_changes', { table: 'conversations', event: '*' }, events)
      .subscribe();
    await vi.advanceTimersByTimeAsync(10);
    added = true;
    await vi.advanceTimersByTimeAsync(4000);
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'INSERT',
        new: { id: 'new-conversation' },
      })
    );
    await client.removeChannel(channel);
  });
  it('retries a transient resource failure on a read', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Resource limit', { status: 508 }))
      .mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetch);
    const request = Promise.resolve(
      createMysqlBrowserClient().from('clinic_appointments').select('id')
    );
    await vi.advanceTimersByTimeAsync(800);
    expect((await request).error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('never retries a mutation after an ambiguous server failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    vi.stubGlobal('fetch', fetch);
    const result = await createMysqlBrowserClient()
      .from('clinic_appointments')
      .update({ status: 'confirmed' })
      .eq('id', 'a');
    expect(result.error).toMatchObject({ code: 'HTTP_502' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('preserves schema errors without retrying them', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          data: null,
          error: { message: 'Unknown column', code: 'ER_BAD_FIELD_ERROR' },
        },
        { status: 400 }
      )
    );
    vi.stubGlobal('fetch', fetch);
    const result = await createMysqlBrowserClient()
      .from('clinic_appointments')
      .select('id');
    expect(result.error).toMatchObject({ code: 'ER_BAD_FIELD_ERROR' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

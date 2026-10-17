import { describe, expect, it } from 'vitest';
import { mediaResponse } from './media-response';
const media = {
  data: new Uint8Array([0, 1, 2, 3, 4]),
  mime_type: 'audio/ogg',
  filename: 'ação_日本.ogg',
};
describe('authenticated binary media response', () => {
  it('serves binary media and Unicode filenames without invalid HTTP header characters', async () => {
    const response = mediaResponse(new Request('https://example.com'), media);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/ogg');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''a%C3%A7%C3%A3o_"
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(media.data);
  });
  it('serves seek and suffix ranges and rejects invalid ranges', async () => {
    const response = mediaResponse(
      new Request('https://example.com', { headers: { range: 'bytes=1-3' } }),
      media
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3,
    ]);
    const suffix = mediaResponse(
      new Request('https://example.com', { headers: { range: 'bytes=-2' } }),
      media
    );
    expect([...new Uint8Array(await suffix.arrayBuffer())]).toEqual([3, 4]);
    expect(
      mediaResponse(
        new Request('https://example.com', { headers: { range: 'bytes=99-' } }),
        media
      ).status
    ).toBe(416);
  });
});

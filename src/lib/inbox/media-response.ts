/** Browser audio/video players require valid byte ranges and binary headers. */
export function mediaResponse(
  request: Request,
  media: { data: Uint8Array; mime_type: string; filename: string | null }
) {
  const headers = new Headers({
    'Content-Type': media.mime_type || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  if (media.filename) {
    const filename = media.filename.replace(/[\\\r\n"]/g, '_').slice(0, 180);
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_');
    headers.set(
      'Content-Disposition',
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`
    );
  }
  const size = media.data.byteLength;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1]
      ? Number(match[1])
      : match?.[2]
        ? Math.max(0, size - Number(match[2]))
        : NaN;
    const end =
      match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    ) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(new Uint8Array(media.data.slice(start, end + 1)), {
      status: 206,
      headers,
    });
  }
  headers.set('Content-Length', String(size));
  return new Response(new Uint8Array(media.data), { headers });
}

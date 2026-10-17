import type { Message } from '@/types';

let activeLoads = 0;
const waiting: Array<() => void> = [];
/** Avoid flooding shared hosting when a conversation contains many attachments. */
export async function withMediaSlot(
  signal: AbortSignal,
  load: () => Promise<void>
) {
  await new Promise<void>((resolve) => {
    const start = () => {
      activeLoads++;
      resolve();
    };
    if (activeLoads < 3) start();
    else waiting.push(start);
  });
  try {
    if (!signal.aborted) await load();
  } finally {
    activeLoads--;
    waiting.shift()?.();
  }
}

/** Never use WhatsApp's encrypted CDN URL as a browser preview. */
export function mediaSources(
  message: Pick<Message, 'media_url' | 'message_id'>
): string[] {
  const sources: string[] = [];
  const url = message.media_url?.trim();
  if (
    url &&
    (/^\/(?!\/)/.test(url) || /^https?:\/\//i.test(url) || /^blob:/.test(url))
  ) {
    const encrypted =
      /^https?:\/\/[^/]*(?:whatsapp\.net|whatsapp\.com)\//i.test(url) &&
      /\.enc(?:\?|$)/i.test(url);
    if (!encrypted) sources.push(url);
  }
  if (message.message_id)
    sources.push(
      `/api/whatsapp/bridge-media/${encodeURIComponent(message.message_id)}`
    );
  return [...new Set(sources)];
}

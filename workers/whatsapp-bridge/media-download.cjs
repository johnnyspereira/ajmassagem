/**
 * WhatsApp Web's current media downloader needs the MIME type explicitly.
 * The library's legacy msg.downloadMedia() stage can also fail with `r`.
 * Resolve the message and decrypt with the current download manager instead.
 */
async function downloadCompatibleMedia(message) {
  const id = message?.id?._serialized || message?.id?.$1 || message?.id?.id;
  if (!id || !message?.client?.pupPage) return null;
  try {
    const media = await message.client.pupPage.evaluate(async (messageId) => {
      const collection = window.require('WAWebCollections').Msg;
      const msg =
        collection.get(messageId) ||
        collection.getModelsArray().find((item) => item.id?.id === messageId) ||
        (await collection.getMessagesById([messageId]))?.messages?.[0];
      if (!msg?.directPath || !msg.mediaKey || !msg.mimetype) return null;
      if (Number(msg.size || 0) > 16 * 1024 * 1024) return null;
      const qpl = {
        addAnnotations() {
          return this;
        },
        addPoint() {
          return this;
        },
      };
      const bytes = await window
        .require('WAWebDownloadManager')
        .downloadManager.downloadAndMaybeDecrypt({
          directPath: msg.directPath,
          encFilehash: msg.encFilehash,
          filehash: msg.filehash,
          mediaKey: msg.mediaKey,
          mediaKeyTimestamp: msg.mediaKeyTimestamp,
          type: msg.type,
          mimetype: msg.mimetype,
          mimeType: msg.mimetype,
          signal: AbortSignal.timeout(20000),
          downloadQpl: qpl,
        });
      if (!bytes?.byteLength || bytes.byteLength > 16 * 1024 * 1024)
        return null;
      return {
        data: await window.WWebJS.arrayBufferToBase64Async(bytes),
        mimetype: msg.mimetype,
        filename: msg.filename || null,
      };
    }, id);
    if (media?.data) return media;
  } catch {
    // Keep the upstream path as a fallback for older WhatsApp Web sessions.
  }
  return message.downloadMedia?.().catch(() => null);
}
module.exports = { downloadCompatibleMedia };

const http = require('node:http');
const { createHmac } = require('node:crypto');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { rm } = require('node:fs/promises');
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || 4100);
const SECRET = process.env.WORKER_SECRET;
const CRM_URL = String(process.env.CRM_URL || '').replace(/\/+$/, '');
const CRM_BRIDGE_PATH = String(
  process.env.CRM_BRIDGE_PATH || '/api/whatsapp/bridge-v2'
).startsWith('/')
  ? String(process.env.CRM_BRIDGE_PATH || '/api/whatsapp/bridge-v2')
  : `/${String(process.env.CRM_BRIDGE_PATH || '/api/whatsapp/bridge-v2')}`;
const AUTH_DIR = path.resolve(process.env.WHATSAPP_AUTH_DIR || 'whatsapp_auth');
const CLIENT_ID = 'jpmassagem';
const WORKER_ID = process.env.WORKER_ID || `jpmassagem-${process.platform}`;
if (!SECRET || !CRM_URL) {
  console.error('Configure WORKER_SECRET and CRM_URL in .env.');
  process.exit(1);
}

let client = null;
let starting = null;
let qr = null;
let state = 'idle';
let lastError = null;
let connectedAt = null;
let lastActivityAt = null;
let lastRestartAt = null;
let restartCount = 0;
const recentOutgoing = [];
let context = {
  accountId: process.env.ACCOUNT_ID || null,
  userId: process.env.USER_ID || null,
};

function reply(res, code, value) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
function touch() {
  lastActivityAt = new Date().toISOString();
}
function saved() {
  return existsSync(path.join(AUTH_DIR, `session-${CLIENT_ID}`));
}
function bind(input = {}) {
  context.accountId = input.accountId || input.account_id || context.accountId;
  context.userId = input.userId || input.user_id || context.userId;
  if (!context.accountId || !context.userId)
    throw new Error('accountId and userId are required.');
  return context;
}
function status() {
  const connected = state === 'connected' || Boolean(client?.info?.wid);
  return {
    connected,
    state: connected ? 'connected' : state,
    qr: connected ? null : qr,
    lastError,
    userJid: client?.info?.wid?._serialized || null,
    connectedAt,
    connectedForSeconds: connectedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000))
      : null,
    hasSavedAuth: saved(),
    isStarting: Boolean(starting),
    lastActivityAt,
    lastRestartAt,
    restartCount,
  };
}
function normalize(value) {
  let digits = String(value || '').replace(/\D/g, '');
  // Accept a Portuguese mobile entered in local format, for example
  // 9XXXXXXXX, without sending it to the wrong international recipient.
  if (/^9\d{8}$/.test(digits)) digits = `351${digits}`;
  return digits ? `+${digits}` : '';
}
function jidPhone(value) {
  return normalize(String(value || '').split('@')[0]);
}
// WhatsApp is migrating private chats to LID identifiers.  A LID is not a
// telephone number, despite looking numeric, so it must never become a CRM
// contact key. whatsapp-web.js exposes the official paired phone lookup.
async function resolveConversationPhone(jid) {
  const raw = String(jid || '');
  if (!raw.endsWith('@lid')) {
    const phone = jidPhone(raw);
    return phone ? { phone, aliases: [] } : null;
  }
  const alias = jidPhone(raw);
  let pairs = [];
  try {
    pairs = await client.getContactLidAndPhone([raw]);
  } catch {
    return null;
  }
  const pairedPhone = String(pairs?.[0]?.pn || '');
  const phone = pairedPhone.endsWith('@c.us') ? jidPhone(pairedPhone) : '';
  // Do not fall back to the LID digits. Waiting for WhatsApp to resolve it
  // is safer than creating a fictional customer conversation.
  return phone ? { phone, aliases: alias ? [alias] : [] } : null;
}
function externalId(message) {
  return message?.id?._serialized || message?.id?.id || null;
}
function normalizedContentType(message) {
  const type = String(message?.type || 'text');
  if (type === 'chat') return 'text';
  if (type === 'ptt') return 'audio';
  if (type === 'sticker') return 'image';
  return ['image', 'document', 'audio', 'video', 'location'].includes(type)
    ? type
    : 'text';
}
async function inboundMediaPayload(message) {
  if (!message?.hasMedia || message?.fromMe) return {};
  const media = await message.downloadMedia().catch(() => null);
  if (!media?.data || !media?.mimetype) return {};
  return {
    mediaBase64: media.data,
    mediaMimeType: media.mimetype,
    mediaFilename:
      media.filename || message.filename || `${externalId(message) || 'attachment'}`,
  };
}
function rememberOutgoing(message) {
  if (!message?.fromMe || !externalId(message)) return;
  recentOutgoing.push({
    id: externalId(message),
    text: String(message.body || message.caption || ''),
    createdAt: Date.now(),
  });
  if (recentOutgoing.length > 100) recentOutgoing.splice(0, recentOutgoing.length - 100);
}
async function waitForOutgoingId(text, startedAt, timeout = 10000) {
  const expected = String(text || '');
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const matched = recentOutgoing.find(
      (entry) => entry.createdAt >= startedAt && entry.text === expected
    );
    if (matched) return matched.id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}
function ackStatus(ack) {
  return ack >= 3
    ? 'read'
    : ack === 2
      ? 'delivered'
      : ack === 1
        ? 'sent'
        : ack < 0
          ? 'failed'
          : null;
}
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
function auth(req) {
  if (req.headers.authorization !== `Bearer ${SECRET}`) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
}
async function crm(action, data) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const timestamp = String(Date.now());
      const signedAccountId = String(data?.accountId || '');
      const endpoint = new URL(`${CRM_URL}${CRM_BRIDGE_PATH}`);
      endpoint.searchParams.set('worker_ts', timestamp);
      endpoint.searchParams.set('worker_action', action);
      endpoint.searchParams.set(
        'worker_sig',
        createHmac('sha256', SECRET)
          .update(`${timestamp}.${signedAccountId}.${action}`)
          .digest('hex')
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${SECRET}`,
          // Kept alongside Bearer because some cPanel/Passenger proxies drop
          // Authorization before the request reaches the Next.js route.
          'x-whatsapp-worker-secret': SECRET,
        },
        // A shared-hosting proxy may strip both Authorization and custom
        // request headers. The CRM accepts this HTTPS body field as a final
        // authenticated transport; it is validated and never persisted.
        body: JSON.stringify({ action, workerSecret: SECRET, ...data }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error = new Error(
        payload.error || `CRM returned HTTP ${response.status}`
      );
      if (![408, 429, 500, 502, 503, 504].includes(response.status))
        throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 250 * 2 ** (attempt - 1))
    );
  }
  throw lastError || new Error('CRM request failed.');
}

async function persist(message) {
  const id = externalId(message);
  if (!id) return null;
  const jid = message.fromMe ? message.to : message.from;
  if (!/@(c\.us|lid)$/.test(String(jid || '')) || String(jid).includes('-'))
    return null;
  const contact = await message.getContact().catch(() => null);
  const resolution = await resolveConversationPhone(jid);
  if (!resolution?.phone) return null;
  const profilePicUrl = await contact?.getProfilePicUrl?.().catch(() => null);
  const timestamp = new Date(
    Number(message.timestamp || Date.now() / 1000) * 1000
  ).toISOString();
  const result = await crm('persist_message', {
    ...bind(),
    messageId: id,
    fromMe: Boolean(message.fromMe),
    phone: resolution.phone,
    phoneAliases: resolution.aliases,
    name:
      contact?.pushname || contact?.name || contact?.shortName || resolution.phone,
    profilePicUrl: profilePicUrl || null,
    contentType: normalizedContentType(message),
    text: message.body || message.caption || '',
    timestamp,
    ...(await inboundMediaPayload(message)),
  });
  return result?.duplicate ? null : result;
}
async function persistSyncSnapshot(snapshot, media = {}) {
  if (!snapshot?.messageId || !snapshot.phone) return null;
  const result = await crm('persist_message', {
    ...bind(),
    messageId: snapshot.messageId,
    fromMe: Boolean(snapshot.fromMe),
    phone: normalize(snapshot.phone),
    phoneAliases: snapshot.phoneAliases || [],
    name: snapshot.name || normalize(snapshot.phone),
    profilePicUrl: null,
    contentType: snapshot.contentType,
    text: snapshot.text || '',
    timestamp: snapshot.timestamp,
    historical: true,
    ...media,
  });
  return result?.duplicate ? null : result;
}
function wire(instance) {
  instance.on('qr', (value) => {
    qr = value;
    state = 'qr';
    lastError = null;
    touch();
    qrcode.generate(value, { small: true });
    console.log('[bridge] Leia o QR no WhatsApp.');
  });
  instance.on('ready', () => {
    qr = null;
    state = 'connected';
    connectedAt = new Date().toISOString();
    lastError = null;
    touch();
    console.log('[bridge] WhatsApp conectado.');
  });
  instance.on('message', (message) => {
    touch();
    persist(message).catch((e) =>
      console.error('[bridge] entrada:', e.message)
    );
  });
  instance.on('message_create', (message) => {
    if (!message.fromMe) return;
    touch();
    rememberOutgoing(message);
    // Messages sent from the CRM are already represented by an outbox row.
    // Persisting the same WhatsApp event here races with `complete_outbox`:
    // the event can create the external-id row first, leaving the queued CRM
    // message stuck as "sending" even though WhatsApp accepted it. The outbox
    // completion is therefore the single source of truth for Inbox sends.
    // Messages authored directly in WhatsApp are still picked up by Sync.
  });
  instance.on('message_ack', (message, ack) => {
    const next = ackStatus(Number(ack));
    if (next && externalId(message))
      crm('ack', {
        ...bind(),
        messageId: externalId(message),
        status: next,
      }).catch(() => {});
  });
  instance.on('auth_failure', (value) => {
    state = 'error';
    lastError = String(value);
    connectedAt = null;
  });
  instance.on('disconnected', (value) => {
    state = 'disconnected';
    lastError = String(value);
    connectedAt = null;
    client = null;
  });
}
async function start(input = {}, restoreOnly = false) {
  bind(input);
  if (client || starting || (restoreOnly && !saved())) return status();
  state = 'starting';
  qr = null;
  lastError = null;
  lastRestartAt = new Date().toISOString();
  restartCount++;
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR, clientId: CLIENT_ID }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    },
  });
  wire(client);
  starting = client
    .initialize()
    .catch((e) => {
      lastError = e.message;
      state = 'error';
      client = null;
    })
    .finally(() => {
      starting = null;
    });
  await Promise.race([
    starting,
    new Promise((resolve) => setTimeout(resolve, 45000)),
  ]);
  return status();
}
async function stop(clear = false) {
  if (client) await client.destroy().catch(() => {});
  client = null;
  starting = null;
  qr = null;
  connectedAt = null;
  state = clear ? 'idle' : 'disconnected';
  if (clear)
    await rm(path.join(AUTH_DIR, `session-${CLIENT_ID}`), {
      recursive: true,
      force: true,
    });
}
async function send(input) {
  bind(input);
  if (!client || !status().connected)
    throw new Error('WhatsApp QR is not connected.');
  const conversationId = input.conversationId || input.conversation_id;
  const message = input.message || {};
  const resolved = await crm('resolve_conversation', {
    ...context,
    conversationId,
  });
  const jid = `${normalize(resolved.phone).replace(/\D/g, '')}@c.us`;
  const type = message.contentType || 'text';
  const text = String(message.text || '');
  let content = text;
  const options = { waitUntilMsgSent: true };
  if (['image', 'video', 'document', 'audio'].includes(type)) {
    if (!message.mediaUrl) throw new Error('mediaUrl is required.');
    content = await MessageMedia.fromUrl(message.mediaUrl, {
      unsafeMime: true,
      filename: message.filename || undefined,
    });
    if (text && type !== 'audio') options.caption = text;
    if (type === 'audio') options.sendAudioAsVoice = true;
    if (type === 'document') options.sendMediaAsDocument = true;
  }
  const sendStartedAt = Date.now();
  const sent = await client.sendMessage(jid, content, options);
  const whatsappMessageId =
    externalId(sent) || (await waitForOutgoingId(text, sendStartedAt));
  if (!whatsappMessageId) throw new Error('WhatsApp did not return an id.');
  const stored = await crm('persist_outgoing', {
    ...context,
    conversationId,
    messageId: whatsappMessageId,
    senderType: message.senderType || 'agent',
    contentType: type,
    text,
    mediaUrl: message.mediaUrl || null,
    templateName: message.templateName || null,
    interactivePayload: message.interactivePayload || null,
    replyToMessageId: message.replyToMessageId || null,
  });
  return { messageId: stored.messageId, whatsappMessageId };
}
async function sendOutboxJob(job) {
  if (!client || !status().connected)
    throw new Error('WhatsApp QR is not connected.');
  const message = job.payload || {};
  const digits = normalize(job.phone).replace(/\D/g, '');
  if (!digits) throw new Error('Invalid recipient phone.');
  const registered = await client.getNumberId(digits).catch(() => null);
  if (!registered) throw new Error('Recipient is not registered on WhatsApp.');
  const jid = registered._serialized || `${digits}@c.us`;
  const type = message.contentType || 'text';
  const text = String(message.text || '');
  let content = text;
  const options = { waitUntilMsgSent: true };
  if (['image', 'video', 'document', 'audio'].includes(type)) {
    if (!message.mediaUrl) throw new Error('mediaUrl is required.');
    content = await MessageMedia.fromUrl(message.mediaUrl, {
      unsafeMime: true,
      filename: message.filename || undefined,
    });
    if (text && type !== 'audio') options.caption = text;
    if (type === 'audio') options.sendAudioAsVoice = true;
    if (type === 'document') options.sendMediaAsDocument = true;
  }
  const sendStartedAt = Date.now();
  const sent = await client.sendMessage(jid, content, options);
  const providerMessageId =
    externalId(sent) || (await waitForOutgoingId(text, sendStartedAt));
  if (!providerMessageId)
    throw new Error('WhatsApp did not return a message id.');
  await crm('complete_outbox', {
    ...context,
    jobId: job.id,
    providerMessageId,
    workerId: WORKER_ID,
  });
}
let polling = false;
async function processCommand(command) {
  const payload = command.payload || {};
  if (command.command_type === 'restart') {
    await stop(false);
    await start(context);
    return;
  }
  if (command.command_type === 'logout') {
    await stop(true);
    return;
  }
  if (command.command_type === 'sync') {
    await sync({ ...context, ...payload });
    return;
  }
  throw new Error(`Unsupported worker command: ${command.command_type}`);
}
async function pollOutbox() {
  if (polling || !context.accountId || !context.userId) return;
  polling = true;
  try {
    const current = status();
    await crm('heartbeat', {
      ...context,
      workerId: WORKER_ID,
      connected: current.connected,
      state: current.state,
      qr: current.qr,
      userJid: current.userJid,
      hasSavedAuth: current.hasSavedAuth,
      connectedAt: current.connectedAt,
      lastActivityAt: current.lastActivityAt,
      lastError: current.lastError,
    });
    const claimedCommand = await crm('claim_command', {
      ...context,
      workerId: WORKER_ID,
    });
    if (claimedCommand?.command) {
      try {
        await processCommand(claimedCommand.command);
        await crm('complete_command', {
          ...context,
          commandId: claimedCommand.command.id,
          workerId: WORKER_ID,
        });
      } catch (error) {
        await crm('complete_command', {
          ...context,
          commandId: claimedCommand.command.id,
          workerId: WORKER_ID,
          error: error?.message || String(error),
        }).catch(() => {});
      }
    }
    if (!status().connected) return;
    for (let count = 0; count < 10; count++) {
      const claimed = await crm('claim_outbox', {
        ...context,
        workerId: WORKER_ID,
      });
      if (!claimed?.job) break;
      try {
        await sendOutboxJob(claimed.job);
      } catch (error) {
        await crm('fail_outbox', {
          ...context,
          jobId: claimed.job.id,
          workerId: WORKER_ID,
          error: error?.message || String(error),
        }).catch(() => {});
      }
    }
  } catch (error) {
    lastError = error?.message || String(error);
  } finally {
    polling = false;
  }
}
async function sync(input) {
  bind(input);
  await start(input, true);
  if (!client || !status().connected)
    throw new Error('WhatsApp QR is not connected.');
  let chatsScanned = 0,
    messagesScanned = 0,
    messagesPersisted = 0;
  // WhatsApp Web's current chat serializer can reject an individual chat
  // with the opaque `r: r` error. Read only the primitive data we need in
  // the browser page; this avoids `getChats()` / `getChatById()` entirely.
  const snapshots = await client.pupPage.evaluate(
    async (chatLimit, messageLimit) => {
      const chats = window
        .require('WAWebCollections')
        .Chat.getModelsArray()
        .filter((chat) => /@(c\.us|lid)$/.test(String(chat?.id?._serialized || '')))
        .slice(0, chatLimit);
      const rows = [];
      for (const chat of chats) {
        const chatId = chat.id?._serialized;
        let contact = null;
        try {
          contact = await window.WWebJS.getContact(chatId);
        } catch {
          // A direct chat can still be imported without its display name.
        }
        const rawMessages = chat.msgs
          .getModelsArray()
          .filter((message) => !message.isNotification)
          .sort((a, b) => Number(a.t || 0) - Number(b.t || 0))
          .slice(-messageLimit);
        for (const message of rawMessages) {
          const messageId = message.id?._serialized || message.id?.id;
          const phone =
            contact?.id?._serialized ||
            contact?.id?.user ||
            contact?.number ||
            chatId;
          if (!messageId || !phone) continue;
          rows.push({
            chatId,
            messageId,
            phone,
            name:
              contact?.pushname ||
              contact?.name ||
              contact?.shortName ||
              chat.formattedTitle ||
              phone,
            fromMe: Boolean(message.id?.fromMe),
            contentType:
              message.type === 'chat'
                ? 'text'
                : message.type === 'ptt'
                  ? 'audio'
                  : message.type === 'sticker'
                    ? 'image'
                    : message.type,
            text: message.body || message.caption || '',
            hasMedia: Boolean(message.hasMedia),
            timestamp: new Date(Number(message.t || Date.now() / 1000) * 1000).toISOString(),
          });
        }
      }
      return { chatsScanned: chats.length, rows };
    },
    Math.max(1, Number(input.chatLimit || 50)),
    Math.max(1, Number(input.messageLimit || 25))
  );
  chatsScanned = snapshots.chatsScanned;
  for (const snapshot of snapshots.rows) {
    messagesScanned++;
    try {
      const resolution = await resolveConversationPhone(snapshot.phone);
      if (!resolution?.phone) continue;
      const message = snapshot.hasMedia
        ? await client.getMessageById(snapshot.messageId).catch(() => null)
        : null;
      if (
        await persistSyncSnapshot(
          { ...snapshot, phone: resolution.phone, phoneAliases: resolution.aliases },
          await inboundMediaPayload(message)
        )
      )
        messagesPersisted++;
    } catch (error) {
      console.warn('[bridge] sync skipped message:', snapshot.chatId, error?.message);
    }
  }
  return { chatsScanned, messagesScanned, messagesPersisted };
}

// Direct WhatsApp probe: intentionally bypasses the CRM bridge so support
// can distinguish a WhatsApp session failure from a CRM callback failure.
async function whatsappProbe(input) {
  bind(input);
  await start(input, true);
  if (!client || !status().connected)
    throw new Error('WhatsApp QR is not connected.');

  const phone = normalize(input.phone || input.to || '');
  if (!phone) throw new Error('phone is required.');
  const digits = phone.replace(/\D/g, '');
  const registered = await client.getNumberId(digits).catch(() => null);
  const numericJid = `${digits}@c.us`;
  const chatAvailability = await client.pupPage
    .evaluate(async (candidateIds) => {
      const result = {};
      for (const candidateId of candidateIds) {
        try {
          result[candidateId] = Boolean(
            await window.WWebJS.getChat(candidateId, { getAsModel: false })
          );
        } catch {
          result[candidateId] = false;
        }
      }
      return result;
    }, [numericJid, registered?._serialized].filter(Boolean))
    .catch(() => ({}));
  return {
    connected: true,
    phone,
    registered: Boolean(registered),
    jid: registered?._serialized || null,
    chatAvailability,
  };
}

async function sendWhatsAppProbe(input) {
  const probe = await whatsappProbe(input);
  if (!probe.registered)
    throw new Error('The test number is not registered on WhatsApp.');
  const text = String(
    input.text || 'Teste técnico do CRM: saída WhatsApp confirmada.'
  ).slice(0, 500);
  // whatsapp-web.js may return an internal @lid identity from getNumberId.
  // For a direct phone test, always send through the stable numeric JID.
  const candidates = [
    `${probe.phone.replace(/\D/g, '')}@c.us`,
    probe.jid,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const attempts = [];
  let sent;
  let messageId = null;
  for (const jid of candidates) {
    try {
      const sendStartedAt = Date.now();
      sent = await client.sendMessage(jid, text, { waitUntilMsgSent: true });
      messageId = externalId(sent) || (await waitForOutgoingId(text, sendStartedAt));
      attempts.push({ jid, accepted: Boolean(messageId), id: messageId });
      if (messageId) break;
    } catch (error) {
      attempts.push({ jid, accepted: false, error: error.message || String(error) });
    }
  }
  return {
    ...probe,
    messageAccepted: Boolean(messageId),
    messageId,
    attempts,
    // Shape-only diagnostics, never message content or credentials.
    returnedFields:
      sent && typeof sent === 'object' ? Object.keys(sent).slice(0, 12) : [],
  };
}

const server = http.createServer(async (req, res) => {
  try {
    auth(req);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/status') {
      const input = Object.fromEntries(url.searchParams.entries());
      bind(input);
      if (url.searchParams.get('autostart') !== 'false') await start(input);
      return reply(res, 200, status());
    }
    const input = req.method === 'POST' ? await body(req) : {};
    if (req.method === 'POST' && url.pathname === '/send')
      return reply(res, 200, await send(input));
    if (req.method === 'POST' && url.pathname === '/restart') {
      await stop(false);
      return reply(res, 200, { success: true, status: await start(input) });
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      bind(input);
      await stop(true);
      return reply(res, 200, { success: true });
    }
    if (req.method === 'POST' && url.pathname === '/sync')
      return reply(res, 200, { success: true, ...(await sync(input)) });
    if (req.method === 'POST' && url.pathname === '/probe')
      return reply(res, 200, { success: true, ...(await whatsappProbe(input)) });
    if (req.method === 'POST' && url.pathname === '/probe/send')
      return reply(res, 200, { success: true, ...(await sendWhatsAppProbe(input)) });
    return reply(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[bridge]', e);
    return reply(res, e.status || 500, { error: e.message || String(e) });
  }
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] http://127.0.0.1:${PORT}`);
  if (context.accountId && context.userId) void start(context, true);
  setInterval(() => void pollOutbox(), 2000);
});
process.on('SIGINT', () => stop(false).finally(() => process.exit(0)));

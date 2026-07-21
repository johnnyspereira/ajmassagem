const http = require('http');
const path = require('path');
const { existsSync } = require('fs');
const { rm } = require('fs/promises');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || 4100);
const WORKER_SECRET = process.env.WORKER_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_ACCOUNT_ID = process.env.ACCOUNT_ID;
const DEFAULT_USER_ID = process.env.USER_ID;
const AUTH_DIR = path.resolve(process.env.WHATSAPP_AUTH_DIR || 'whatsapp_auth');
const CLIENT_ID = 'ajmassagem';

if (!WORKER_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing WORKER_SECRET, NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let client = null;
let currentQr = null;
let currentState = 'idle';
let lastError = null;
let connectedAt = null;
let lastActivityAt = null;
let lastRestartAt = null;
let restartCount = 0;
let starting = null;
let manualStop = false;
let context = {
  accountId: DEFAULT_ACCOUNT_ID || null,
  userId: DEFAULT_USER_ID || null,
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(data);
}

function touch() {
  lastActivityAt = new Date().toISOString();
}

function hasSavedAuth() {
  return existsSync(path.join(AUTH_DIR, `session-${CLIENT_ID}`));
}

function status() {
  const connected = currentState === 'connected' || Boolean(client?.info?.wid);
  if (connected) {
    currentState = 'connected';
    currentQr = null;
    connectedAt ||= new Date().toISOString();
  }
  return {
    connected,
    state: currentState,
    qr: currentQr,
    lastError,
    userJid: client?.info?.wid?._serialized || client?.info?.me?.user || null,
    connectedAt,
    connectedForSeconds:
      connected && connectedAt
        ? Math.max(0, Math.floor((Date.now() - Date.parse(connectedAt)) / 1000))
        : null,
    hasSavedAuth: hasSavedAuth(),
    isStarting: Boolean(starting) || currentState === 'starting',
    lastActivityAt,
    lastRestartAt,
    restartCount,
  };
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function phoneFromJid(jid) {
  const raw = String(jid || '').split('@')[0];
  return normalizePhone(raw);
}

function isCustomerJid(jid) {
  return /@(c\.us|lid)$/.test(String(jid || '')) && !String(jid).includes('-');
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function requireAuth(req) {
  const expected = `Bearer ${WORKER_SECRET}`;
  if (req.headers.authorization !== expected) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

function bindContext(input = {}) {
  context.accountId = input.accountId || input.account_id || context.accountId;
  context.userId = input.userId || input.user_id || context.userId;
  if (!context.accountId || !context.userId) {
    throw new Error('Worker requires accountId and userId context.');
  }
  return context;
}

async function start(input = {}, options = {}) {
  bindContext(input);
  if (client || starting || options.restoreOnly && !hasSavedAuth()) {
    return status();
  }
  manualStop = false;
  currentState = 'starting';
  currentQr = null;
  lastError = null;
  connectedAt = null;
  touch();
  lastRestartAt = new Date().toISOString();
  restartCount += 1;

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: AUTH_DIR,
      clientId: CLIENT_ID,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    takeoverOnConflict: true,
  });

  wireClient(client);
  starting = client
    .initialize()
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      currentState = 'error';
      console.error('[wa-bridge] initialize failed:', lastError);
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

function wireClient(instance) {
  instance.on('qr', (qr) => {
    currentQr = qr;
    currentState = 'qr';
    connectedAt = null;
    lastError = null;
    touch();
    qrcode.generate(qr, { small: true });
    console.log('[wa-bridge] QR generated. Scan it with WhatsApp.');
  });

  instance.on('ready', () => {
    currentQr = null;
    currentState = 'connected';
    connectedAt ||= new Date().toISOString();
    lastError = null;
    touch();
    console.log('[wa-bridge] WhatsApp connected:', status().userJid);
  });

  instance.on('message', (message) => {
    touch();
    persistWhatsAppMessage(message, { includeOutbound: false }).catch((error) =>
      console.error('[wa-bridge] inbound persist failed:', error)
    );
  });

  instance.on('message_create', (message) => {
    if (!message.fromMe) return;
    touch();
    setTimeout(() => {
      persistWhatsAppMessage(message, { includeOutbound: true }).catch((error) =>
        console.error('[wa-bridge] outbound mirror failed:', error)
      );
    }, 1500);
  });

  instance.on('message_ack', (message, ack) => {
    touch();
    updateMessageAck(message, ack).catch((error) =>
      console.error('[wa-bridge] ack update failed:', error)
    );
  });

  instance.on('disconnected', (reason) => {
    currentState = 'disconnected';
    connectedAt = null;
    currentQr = null;
    lastError = String(reason || 'Disconnected');
    touch();
    client = null;
    if (!manualStop && hasSavedAuth()) {
      setTimeout(() => start(context, { restoreOnly: true }).catch(() => undefined), 5000);
    }
  });

  instance.on('auth_failure', (message) => {
    currentState = 'error';
    lastError = String(message || 'Authentication failed');
    connectedAt = null;
    touch();
  });
}

function messageId(message) {
  return message?.id?._serialized || message?.id?.id || null;
}

async function findOrCreateContact(phone, name) {
  const ctx = bindContext();
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid contact phone.');

  const { data: existing } = await db
    .from('contacts')
    .select('id, name, phone')
    .eq('account_id', ctx.accountId)
    .eq('phone', normalized)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await db
    .from('contacts')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      name: name || normalized,
      phone: normalized,
      source: 'whatsapp',
      preferred_contact: 'whatsapp',
      whatsapp_consent: true,
    })
    .select('id, name, phone')
    .single();
  if (error) throw error;
  return data;
}

async function findOrCreateConversation(contactId) {
  const ctx = bindContext();
  const { data: existing } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existing?.[0]?.id) return existing[0].id;

  const { data, error } = await db
    .from('conversations')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      contact_id: contactId,
      status: 'open',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function persistWhatsAppMessage(message, options = {}) {
  const id = messageId(message);
  if (!id) return null;
  if (message.fromMe && !options.includeOutbound) return null;

  const jid = message.fromMe ? message.to : message.from;
  if (!isCustomerJid(jid)) return null;
  const phone = phoneFromJid(jid);
  if (!phone) return null;

  const contactLike = await message.getContact?.().catch(() => null);
  const name =
    contactLike?.pushname ||
    contactLike?.name ||
    contactLike?.shortName ||
    phone;
  const contact = await findOrCreateContact(phone, name);
  const conversationId = await findOrCreateConversation(contact.id);

  const { data: duplicate } = await db
    .from('messages')
    .select('id')
    .eq('message_id', id)
    .maybeSingle();
  if (duplicate) return duplicate.id;

  const contentType = message.type === 'chat' ? 'text' : message.type || 'text';
  const text = message.body || message.caption || '';
  const { data, error } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: message.fromMe ? 'agent' : 'contact',
      content_type: contentType,
      content_text: text || null,
      message_id: id,
      status: message.fromMe ? ackToStatus(message.ack) || 'sent' : 'delivered',
    })
    .select('id')
    .single();
  if (error) throw error;

  await db
    .from('conversations')
    .update({
      last_message_text: text || `[${contentType}]`,
      last_message_at: new Date(
        Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return data.id;
}

function ackToStatus(ack) {
  if (ack >= 3) return 'read';
  if (ack === 2) return 'delivered';
  if (ack === 1) return 'sent';
  if (ack < 0) return 'failed';
  return null;
}

async function updateMessageAck(message, ack) {
  const id = messageId(message);
  const next = ackToStatus(Number(ack));
  if (!id || !next) return;
  await db.from('messages').update({ status: next }).eq('message_id', id);
}

async function sendMessage(body) {
  if (!client || !status().connected) {
    throw new Error('WhatsApp QR session is not connected.');
  }
  const ctx = bindContext(body);
  const conversationId = body.conversationId || body.conversation_id;
  const input = body.message || {};
  if (!conversationId) throw new Error('conversationId is required.');

  const { data: conversation, error } = await db
    .from('conversations')
    .select('id, contact:contacts(id, phone)')
    .eq('id', conversationId)
    .eq('account_id', ctx.accountId)
    .single();
  if (error || !conversation) throw new Error('Conversation not found.');

  const phone = normalizePhone(conversation.contact?.phone);
  if (!phone) throw new Error('Contact phone number is invalid.');
  const jid = `${phone.replace(/\D/g, '')}@c.us`;
  const text = String(input.text || '').trim();
  const contentType = input.contentType || 'text';
  const isMedia = ['image', 'video', 'document', 'audio'].includes(contentType);
  if (!text && !isMedia) throw new Error('Message text is required.');
  if (isMedia && !input.mediaUrl) {
    throw new Error(`mediaUrl is required for ${contentType}.`);
  }

  let content = text;
  const options = {};
  if (isMedia) {
    content = await MessageMedia.fromUrl(input.mediaUrl, {
      unsafeMime: true,
      filename: input.filename || undefined,
    });
    if (text && contentType !== 'audio') options.caption = text;
    if (contentType === 'audio') options.sendAudioAsVoice = true;
    if (contentType === 'document') options.sendMediaAsDocument = true;
  }

  const sent = await client.sendMessage(jid, content, options);
  const whatsappMessageId = messageId(sent);
  if (!whatsappMessageId) {
    throw new Error('WhatsApp did not confirm the sent message id.');
  }

  const { data, error: insertError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: input.senderType || 'agent',
      content_type: contentType,
      content_text: text || null,
      media_url: input.mediaUrl || null,
      template_name: input.templateName || null,
      interactive_payload:
        contentType === 'interactive' ? input.interactivePayload || null : null,
      message_id: whatsappMessageId,
      status: 'sent',
      reply_to_message_id: input.replyToMessageId || null,
    })
    .select('id')
    .single();
  if (insertError) throw insertError;

  await db
    .from('conversations')
    .update({
      last_message_text: text || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return { messageId: data.id, whatsappMessageId };
}

async function syncHistory(body) {
  await start(body, { restoreOnly: true });
  if (!client || !status().connected) {
    throw new Error('WhatsApp QR session is not connected.');
  }
  const chatLimit = Number(body.chatLimit || body.chat_limit || 50);
  const messageLimit = Number(body.messageLimit || body.message_limit || 25);
  const chats = await client.getChats();
  let chatsScanned = 0;
  let messagesScanned = 0;
  let messagesPersisted = 0;

  for (const chat of chats.slice(0, chatLimit)) {
    const jid = chat?.id?._serialized;
    if (!isCustomerJid(jid)) continue;
    chatsScanned += 1;
    const messages = await chat.fetchMessages({ limit: messageLimit });
    for (const message of messages) {
      messagesScanned += 1;
      const persisted = await persistWhatsAppMessage(message, {
        includeOutbound: true,
      });
      if (persisted) messagesPersisted += 1;
    }
  }

  return { chatsScanned, messagesScanned, messagesPersisted };
}

async function restart(body) {
  bindContext(body);
  await destroy(false);
  return start(context);
}

async function destroy(clearAuth) {
  manualStop = true;
  if (client) {
    await client.destroy().catch(() => undefined);
    client = null;
  }
  currentQr = null;
  currentState = clearAuth ? 'idle' : 'disconnected';
  connectedAt = null;
  starting = null;
  if (clearAuth) {
    await rm(path.join(AUTH_DIR, `session-${CLIENT_ID}`), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }
}

async function handle(req, res) {
  try {
    requireAuth(req);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/status') {
      const input = Object.fromEntries(url.searchParams.entries());
      bindContext(input);
      if (url.searchParams.get('autostart') !== 'false') await start(input);
      return json(res, 200, status());
    }

    const body = req.method === 'POST' ? await parseBody(req) : {};
    if (req.method === 'POST' && url.pathname === '/send') {
      return json(res, 200, await sendMessage(body));
    }
    if (req.method === 'POST' && url.pathname === '/restart') {
      const next = await restart(body);
      return json(res, 200, { success: true, status: next });
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      bindContext(body);
      await destroy(true);
      return json(res, 200, { success: true });
    }
    if (req.method === 'POST' && url.pathname === '/sync') {
      const result = await syncHistory(body);
      return json(res, 200, { success: true, ...result });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const statusCode = error.status || 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[wa-bridge] request failed:', message);
    return json(res, statusCode, { error: message });
  }
}

const server = http.createServer(handle);
server.listen(PORT, () => {
  console.log(`[wa-bridge] listening on http://localhost:${PORT}`);
  if (context.accountId && context.userId && hasSavedAuth()) {
    start(context, { restoreOnly: true }).catch((error) =>
      console.error('[wa-bridge] auto-restore failed:', error)
    );
  }
});

process.on('SIGINT', () => {
  destroy(false).finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  destroy(false).finally(() => process.exit(0));
});

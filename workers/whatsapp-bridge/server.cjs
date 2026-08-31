const http = require('node:http');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { rm } = require('node:fs/promises');
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || 4100);
const SECRET = process.env.WORKER_SECRET;
const CRM_URL = String(process.env.CRM_URL || '').replace(/\/+$/, '');
const AUTH_DIR = path.resolve(process.env.WHATSAPP_AUTH_DIR || 'whatsapp_auth');
const CLIENT_ID = 'jpmassagem';
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
let context = { accountId: process.env.ACCOUNT_ID || null, userId: process.env.USER_ID || null };

function reply(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
function touch() { lastActivityAt = new Date().toISOString(); }
function saved() { return existsSync(path.join(AUTH_DIR, `session-${CLIENT_ID}`)); }
function bind(input = {}) {
  context.accountId = input.accountId || input.account_id || context.accountId;
  context.userId = input.userId || input.user_id || context.userId;
  if (!context.accountId || !context.userId) throw new Error('accountId and userId are required.');
  return context;
}
function status() {
  const connected = state === 'connected' || Boolean(client?.info?.wid);
  return { connected, state: connected ? 'connected' : state, qr: connected ? null : qr, lastError,
    userJid: client?.info?.wid?._serialized || null, connectedAt,
    connectedForSeconds: connectedAt ? Math.max(0, Math.floor((Date.now()-Date.parse(connectedAt))/1000)) : null,
    hasSavedAuth: saved(), isStarting: Boolean(starting), lastActivityAt, lastRestartAt, restartCount };
}
function normalize(value) { const digits=String(value||'').replace(/\D/g,''); return digits ? `+${digits}` : ''; }
function jidPhone(value) { return normalize(String(value||'').split('@')[0]); }
function externalId(message) { return message?.id?._serialized || message?.id?.id || null; }
function ackStatus(ack) { return ack>=3?'read':ack===2?'delivered':ack===1?'sent':ack<0?'failed':null; }
async function body(req) { const chunks=[]; for await(const chunk of req) chunks.push(chunk); const raw=Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {}; }
function auth(req) { if(req.headers.authorization !== `Bearer ${SECRET}`) { const e=new Error('Unauthorized'); e.status=401; throw e; } }
async function crm(action, data) {
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response = await fetch(`${CRM_URL}/api/whatsapp/bridge`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${SECRET}`}, body:JSON.stringify({action,...data}), signal:AbortSignal.timeout(15000) });
      const payload = await response.json().catch(()=>({}));
      if(response.ok)return payload;
      const error=new Error(payload.error || `CRM returned HTTP ${response.status}`);
      if(![408,429,500,502,503,504].includes(response.status))throw error;
      lastError=error;
    }catch(error){lastError=error;if(attempt===3)break;}
    await new Promise(resolve=>setTimeout(resolve,250*2**(attempt-1)));
  }
  throw lastError || new Error('CRM request failed.');
}

async function persist(message) {
  const id=externalId(message); if(!id) return null;
  const jid=message.fromMe ? message.to : message.from;
  if(!/@(c\.us|lid)$/.test(String(jid||'')) || String(jid).includes('-')) return null;
  const contact=await message.getContact().catch(()=>null);
  const resolvedPhone=String(jid||'').endsWith('@lid') ? normalize(contact?.number) : jidPhone(jid);
  if(!resolvedPhone)return null;
  const timestamp=new Date(Number(message.timestamp||Date.now()/1000)*1000).toISOString();
  const result=await crm('persist_message',{...bind(),messageId:id,fromMe:Boolean(message.fromMe),phone:resolvedPhone,name:contact?.pushname||contact?.name||contact?.shortName||resolvedPhone,contentType:message.type==='chat'?'text':message.type,text:message.body||message.caption||'',timestamp});
  return result?.duplicate ? null : result;
}
function wire(instance) {
  instance.on('qr', value=>{qr=value;state='qr';lastError=null;touch();qrcode.generate(value,{small:true});console.log('[bridge] Leia o QR no WhatsApp.');});
  instance.on('ready',()=>{qr=null;state='connected';connectedAt=new Date().toISOString();lastError=null;touch();console.log('[bridge] WhatsApp conectado.');});
  instance.on('message',message=>{touch();persist(message).catch(e=>console.error('[bridge] entrada:',e.message));});
  instance.on('message_create',message=>{if(!message.fromMe)return;touch();setTimeout(()=>persist(message).catch(e=>console.error('[bridge] espelho:',e.message)),1000);});
  instance.on('message_ack',(message,ack)=>{const next=ackStatus(Number(ack));if(next&&externalId(message))crm('ack',{...bind(),messageId:externalId(message),status:next}).catch(()=>{});});
  instance.on('auth_failure',value=>{state='error';lastError=String(value);connectedAt=null;});
  instance.on('disconnected',value=>{state='disconnected';lastError=String(value);connectedAt=null;client=null;});
}
async function start(input={}, restoreOnly=false) {
  bind(input); if(client||starting||(restoreOnly&&!saved())) return status();
  state='starting';qr=null;lastError=null;lastRestartAt=new Date().toISOString();restartCount++;
  client=new Client({authStrategy:new LocalAuth({dataPath:AUTH_DIR,clientId:CLIENT_ID}),puppeteer:{headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}});
  wire(client); starting=client.initialize().catch(e=>{lastError=e.message;state='error';client=null;}).finally(()=>{starting=null;});
  await Promise.race([starting,new Promise(resolve=>setTimeout(resolve,45000))]); return status();
}
async function stop(clear=false){if(client)await client.destroy().catch(()=>{});client=null;starting=null;qr=null;connectedAt=null;state=clear?'idle':'disconnected';if(clear)await rm(path.join(AUTH_DIR,`session-${CLIENT_ID}`),{recursive:true,force:true});}
async function send(input) {
  bind(input); if(!client||!status().connected)throw new Error('WhatsApp QR is not connected.');
  const conversationId=input.conversationId||input.conversation_id; const message=input.message||{};
  const resolved=await crm('resolve_conversation',{...context,conversationId}); const jid=`${normalize(resolved.phone).replace(/\D/g,'')}@c.us`;
  const type=message.contentType||'text'; const text=String(message.text||''); let content=text; const options={};
  if(['image','video','document','audio'].includes(type)){if(!message.mediaUrl)throw new Error('mediaUrl is required.');content=await MessageMedia.fromUrl(message.mediaUrl,{unsafeMime:true,filename:message.filename||undefined});if(text&&type!=='audio')options.caption=text;if(type==='audio')options.sendAudioAsVoice=true;if(type==='document')options.sendMediaAsDocument=true;}
  const sent=await client.sendMessage(jid,content,options);const whatsappMessageId=externalId(sent);if(!whatsappMessageId)throw new Error('WhatsApp did not return an id.');
  const stored=await crm('persist_outgoing',{...context,conversationId,messageId:whatsappMessageId,senderType:message.senderType||'agent',contentType:type,text,mediaUrl:message.mediaUrl||null,templateName:message.templateName||null,interactivePayload:message.interactivePayload||null,replyToMessageId:message.replyToMessageId||null});
  return {messageId:stored.messageId,whatsappMessageId};
}
async function sync(input){bind(input);await start(input,true);if(!client||!status().connected)throw new Error('WhatsApp QR is not connected.');const chats=await client.getChats();let chatsScanned=0,messagesScanned=0,messagesPersisted=0;for(const chat of chats.slice(0,Number(input.chatLimit||50))){if(!/@(c\.us|lid)$/.test(String(chat?.id?._serialized||'')))continue;chatsScanned++;for(const message of await chat.fetchMessages({limit:Number(input.messageLimit||25)})){messagesScanned++;if(await persist(message))messagesPersisted++;}}return {chatsScanned,messagesScanned,messagesPersisted};}

const server=http.createServer(async(req,res)=>{try{auth(req);const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(req.method==='GET'&&url.pathname==='/status'){const input=Object.fromEntries(url.searchParams.entries());bind(input);if(url.searchParams.get('autostart')!=='false')await start(input);return reply(res,200,status());}const input=req.method==='POST'?await body(req):{};if(req.method==='POST'&&url.pathname==='/send')return reply(res,200,await send(input));if(req.method==='POST'&&url.pathname==='/restart'){await stop(false);return reply(res,200,{success:true,status:await start(input)});}if(req.method==='POST'&&url.pathname==='/logout'){bind(input);await stop(true);return reply(res,200,{success:true});}if(req.method==='POST'&&url.pathname==='/sync')return reply(res,200,{success:true,...await sync(input)});return reply(res,404,{error:'Not found'});}catch(e){console.error('[bridge]',e);return reply(res,e.status||500,{error:e.message||String(e)});}});
server.listen(PORT,'127.0.0.1',()=>console.log(`[bridge] http://127.0.0.1:${PORT}`));
process.on('SIGINT',()=>stop(false).finally(()=>process.exit(0)));

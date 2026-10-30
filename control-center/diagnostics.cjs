function sessionAdvice(meta = {}) {
  const error = String(meta.lastError || '');
  if (meta.connected) return { title: 'WhatsApp ligado', detail: 'A sessão está pronta para receber e enviar mensagens.', tone: 'ok' };
  if (meta.state === 'qr') return { title: 'É necessário ler o QR', detail: 'Abra Consultar QR e use Dispositivos associados no WhatsApp do telemóvel.', tone: 'warning' };
  if (/browser.*already running|userDataDir|navegador bloqueado/i.test(error)) return { title: 'Navegador da sessão bloqueado', detail: 'Use Recuperar WhatsApp. A recuperação preserva a autenticação e pode reiniciar o processo.', tone: 'error' };
  if (meta.isStarting || meta.state === 'starting') return { title: 'A preparar a sessão', detail: 'Aguarde a ligação. Evite repetir o reinício enquanto o navegador está a abrir.', tone: 'warning' };
  return { title: 'Sessão por recuperar', detail: error || 'O processo existe, mas a sessão do WhatsApp não está ligada. Use Recuperar WhatsApp para tentar novamente.', tone: 'error' };
}

function safeSession(meta = {}) {
  return { connected: Boolean(meta.connected), state: meta.state || 'unknown', hasSavedAuth: Boolean(meta.hasSavedAuth), isStarting: Boolean(meta.isStarting), lastError: meta.lastError || null, connectedAt: meta.connectedAt || null, lastActivityAt: meta.lastActivityAt || null, restartCount: Number(meta.restartCount || 0) };
}

function createRedactor(...environments) {
  const secrets = environments.flatMap(env => Object.entries(env || {}).filter(([key, value]) => /SECRET|TOKEN|PASSWORD|API_KEY|ENCRYPTION_KEY/.test(key) && typeof value === 'string' && value.length >= 4).map(([, value]) => value));
  return value => {
    let text = String(value || '');
    for (const secret of secrets) text = text.split(secret).join('[oculto]');
    return text.replace(/Bearer\s+[\w.~-]+/gi, 'Bearer [oculto]').replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[imagem omitida]').slice(0, 3000);
  };
}

const crmRoutes = { inbox: '/inbox', reminders: '/agenda/lembretes', finance: '/finance', settings: '/settings', home: '/dashboard' };
function crmUrl(origin, page) {
  if (!Object.hasOwn(crmRoutes, page)) throw new Error('Área do CRM inválida.');
  const base = new URL(origin || 'https://jpmassagem.pt');
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('Endereço do CRM inválido.');
  return new URL(crmRoutes[page], base.origin).href;
}
module.exports = { sessionAdvice, safeSession, createRedactor, crmUrl };

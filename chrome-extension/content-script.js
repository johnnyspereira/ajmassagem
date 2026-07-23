(() => {
  const ROOT_ID = 'aj-crm-root';
  const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;

  const state = {
    open: true,
    crmUrl: '',
    apiKey: '',
    conversation: {
      name: '',
      phone: '',
      rawPhone: '',
    },
    contact: null,
    status: 'Aguardando conversa no WhatsApp Web.',
    statusKind: 'neutral',
    loading: false,
  };

  function normalizeUrl(value) {
    const trimmed = String(value || '')
      .trim()
      .replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function normalizePhone(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits;
  }

  function firstPhone(text) {
    const matches = String(text || '').match(PHONE_RE) || [];
    const hit = matches.find((item) => normalizePhone(item).length >= 8);
    return hit || '';
  }

  function textOf(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getMainHeader() {
    return (
      document.querySelector('#main header') ||
      document.querySelector('[data-testid="conversation-panel-header"]') ||
      document.querySelector('[data-testid="conversation-info-header"]')
    );
  }

  function detectConversation() {
    const header = getMainHeader();
    if (!header) {
      return { name: '', phone: '', rawPhone: '' };
    }

    const titleNode =
      header.querySelector('span[title]') ||
      header.querySelector('[dir="auto"][title]') ||
      header.querySelector('[role="button"] span[dir="auto"]') ||
      header.querySelector('span[dir="auto"]');

    const headerText = textOf(header);
    const title =
      titleNode?.getAttribute?.('title')?.trim() || textOf(titleNode) || '';
    const rawPhone = firstPhone(`${title} ${headerText} ${document.title}`);

    return {
      name: title || rawPhone || '',
      rawPhone,
      phone: normalizePhone(rawPhone),
    };
  }

  async function loadSettings() {
    const data = await chrome.storage.sync.get(['crmUrl', 'apiKey']);
    state.crmUrl = normalizeUrl(data.crmUrl);
    state.apiKey = data.apiKey || '';
  }

  function requireConfig() {
    if (!state.crmUrl || !state.apiKey) {
      throw new Error(
        'Configure a URL do CRM e a API key no ícone da extensão.'
      );
    }
  }

  async function crmFetch(path, init = {}) {
    requireConfig();
    const response = await chrome.runtime.sendMessage({
      type: 'AJ_CRM_FETCH',
      crmUrl: state.crmUrl,
      apiKey: state.apiKey,
      path,
      init,
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Falha ao comunicar com o CRM.');
    }
    return response.payload;
  }

  function setStatus(message, kind = 'neutral') {
    state.status = message;
    state.statusKind = kind;
    render();
  }

  async function findContact() {
    const phone = state.conversation.phone;
    if (!phone) {
      setStatus(
        'Não consegui detectar o telefone nesta conversa. Abra o perfil do contato no WhatsApp Web ou use uma conversa cujo cabeçalho mostre o número.',
        'error'
      );
      return;
    }

    state.loading = true;
    render();
    try {
      const payload = await crmFetch(
        `/api/v1/contacts?search=${encodeURIComponent(phone)}&limit=5`
      );
      const contacts = Array.isArray(payload.data) ? payload.data : [];
      const exact =
        contacts.find((contact) => normalizePhone(contact.phone) === phone) ||
        contacts[0] ||
        null;
      state.contact = exact;
      setStatus(
        exact
          ? 'Cliente encontrado no CRM.'
          : 'Nenhum cliente encontrado para este número.',
        exact ? 'ok' : 'neutral'
      );
    } catch (error) {
      console.error('[AJ CRM extension] find contact failed:', error);
      setStatus(error.message || 'Falha ao buscar cliente.', 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  async function createOrUpdateContact() {
    const phone = state.conversation.phone;
    if (!phone) {
      setStatus('Não há telefone detectado para criar o cliente.', 'error');
      return;
    }

    state.loading = true;
    render();
    try {
      const payload = await crmFetch('/api/v1/contacts', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          name: state.conversation.name || phone,
        }),
      });
      state.contact = payload.data || null;
      setStatus('Cliente criado/atualizado no CRM.', 'ok');
    } catch (error) {
      console.error('[AJ CRM extension] create contact failed:', error);
      setStatus(error.message || 'Falha ao criar cliente.', 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  function openCrm(path) {
    if (!state.crmUrl) {
      setStatus('Configure a URL do CRM no ícone da extensão.', 'error');
      return;
    }
    window.open(`${state.crmUrl}${path}`, '_blank', 'noopener,noreferrer');
  }

  function render() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.documentElement.appendChild(root);
    }

    const contact = state.contact;
    const tags = Array.isArray(contact?.tags) ? contact.tags : [];
    const initials = (state.conversation.name || '?').slice(0, 2).toUpperCase();

    root.innerHTML = `
      <button class="aj-crm-toggle" type="button" data-action="toggle">
        <span>${state.open ? 'CRM aberto' : 'Abrir CRM'}</span>
      </button>
      <aside class="aj-crm-panel ${state.open ? '' : 'aj-crm-hidden'}">
        <div class="aj-crm-head">
          <div>
            <div class="aj-crm-title">AJ CRM</div>
            <div class="aj-crm-subtitle">Painel dentro do WhatsApp Web</div>
          </div>
          <button class="aj-crm-close" type="button" data-action="toggle">×</button>
        </div>
        <div class="aj-crm-body">
          <div class="aj-crm-section">
            <div class="aj-crm-label">Conversa atual</div>
            <div class="aj-crm-value">${escapeHtml(state.conversation.name || 'Nenhuma conversa detectada')}</div>
            <div class="aj-crm-muted" style="margin-top: 6px;">
              ${state.conversation.phone ? `Telefone: ${escapeHtml(state.conversation.phone)}` : 'Telefone ainda não detectado'}
            </div>
            <div class="aj-crm-row">
              <button class="aj-crm-button" type="button" data-action="find" ${state.loading ? 'disabled' : ''}>Buscar</button>
              <button class="aj-crm-button aj-crm-button-primary" type="button" data-action="create" ${state.loading ? 'disabled' : ''}>Criar/Atualizar</button>
            </div>
          </div>

          <div class="aj-crm-section">
            <div class="aj-crm-label">Cliente 360</div>
            ${
              contact
                ? `
                  <div class="aj-crm-value">${escapeHtml(contact.name || contact.phone || 'Cliente')}</div>
                  <div class="aj-crm-muted" style="margin-top: 6px;">
                    Ref.: ${escapeHtml(contact.client_reference || contact.reference || 'sem referência')}<br />
                    ${escapeHtml(contact.phone || '')}
                  </div>
                  <div class="aj-crm-chipline">
                    ${tags.length ? tags.map((tag) => `<span class="aj-crm-chip">${escapeHtml(tag.name || tag)}</span>`).join('') : '<span class="aj-crm-chip">sem etiquetas</span>'}
                  </div>
                  <div class="aj-crm-row">
                    <button class="aj-crm-button" type="button" data-action="open-contact">Abrir Cliente</button>
                    <button class="aj-crm-button" type="button" data-action="open-inbox">Abrir Inbox</button>
                  </div>
                `
                : `
                  <div class="aj-crm-muted" style="margin-top: 6px;">
                    Busque ou crie o cliente para mostrar dados do CRM aqui.
                  </div>
                `
            }
          </div>

          <div class="aj-crm-section">
            <div class="aj-crm-label">Próximas ações</div>
            <div class="aj-crm-row">
              <button class="aj-crm-button" type="button" data-action="open-agenda">Agenda</button>
              <button class="aj-crm-button" type="button" data-action="open-finance">Financeiro</button>
            </div>
            <div class="aj-crm-status aj-crm-status-${state.statusKind}">
              ${state.loading ? 'Processando...' : escapeHtml(state.status)}
            </div>
          </div>
        </div>
      </aside>
    `;

    root.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', handleAction);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function handleAction(event) {
    const action = event.currentTarget.getAttribute('data-action');
    if (action === 'toggle') {
      state.open = !state.open;
      render();
      return;
    }
    if (action === 'find') {
      void findContact();
      return;
    }
    if (action === 'create') {
      void createOrUpdateContact();
      return;
    }
    if (action === 'open-contact') {
      const id = state.contact?.id;
      openCrm(id ? `/contacts/${id}` : '/contacts');
      return;
    }
    if (action === 'open-inbox') {
      openCrm('/inbox');
      return;
    }
    if (action === 'open-agenda') {
      openCrm('/agenda');
      return;
    }
    if (action === 'open-finance') {
      openCrm('/finance');
    }
  }

  function pollConversation() {
    const next = detectConversation();
    const changed =
      next.name !== state.conversation.name ||
      next.phone !== state.conversation.phone;

    if (changed) {
      state.conversation = next;
      state.contact = null;
      state.status = next.name
        ? 'Conversa detectada. Busque ou crie o cliente no CRM.'
        : 'Aguardando conversa no WhatsApp Web.';
      state.statusKind = 'neutral';
      render();
    }
  }

  async function boot() {
    await loadSettings();
    state.conversation = detectConversation();
    render();
    setInterval(pollConversation, 1200);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.crmUrl) state.crmUrl = normalizeUrl(changes.crmUrl.newValue);
      if (changes.apiKey) state.apiKey = changes.apiKey.newValue || '';
      setStatus('Configuração da extensão atualizada.', 'ok');
    });
  }

  void boot();
})();

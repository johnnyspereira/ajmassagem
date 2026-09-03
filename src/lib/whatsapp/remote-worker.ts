type WorkerSendInput = {
  text: string;
  contentType?: string;
  mediaUrl?: string | null;
  filename?: string | null;
  templateName?: string | null;
  interactivePayload?: unknown;
  replyToMessageId?: string | null;
  senderType?: 'agent' | 'bot';
};

type WorkerSendResult = {
  messageId: string;
  whatsappMessageId: string;
};

type WorkerSessionStatus = {
  connected: boolean;
  state: 'idle' | 'starting' | 'qr' | 'connected' | 'disconnected' | 'error';
  qr: string | null;
  lastError: string | null;
  userJid: string | null;
  connectedAt: string | null;
  connectedForSeconds: number | null;
  hasSavedAuth: boolean;
  isStarting: boolean;
  lastActivityAt: string | null;
  lastRestartAt: string | null;
  restartCount: number;
};

type WorkerSyncResult = {
  chatsScanned: number;
  messagesScanned: number;
  messagesPersisted: number;
};

function runtimeEnv(name: string) {
  // Bracket access is intentional: Next must read these values from the
  // Passenger process at request time instead of folding the CI build value.
  return process.env[name]?.trim();
}

function isRemoteWorkerMode() {
  const mode = runtimeEnv('WHATSAPP_MODE');
  if (mode === 'remote_worker') return true;
  if (mode === 'local_qr') return false;

  // Older cPanel installations used `polling_worker` while already exposing
  // a secured Worker URL. Prefer that live endpoint when both credentials
  // are present: it returns the QR immediately instead of waiting for the
  // optional database heartbeat transport.
  if (mode === 'polling_worker') {
    return Boolean(
      runtimeEnv('WHATSAPP_WORKER_URL') &&
        runtimeEnv('WHATSAPP_WORKER_SECRET')
    );
  }

  // A fully configured remote worker is safer than silently falling back to
  // whatsapp-web.js on shared hosting. This also keeps older cPanel installs
  // working when WHATSAPP_MODE was not persisted after an application move.
  if (
    runtimeEnv('WHATSAPP_WORKER_URL') &&
    runtimeEnv('WHATSAPP_WORKER_SECRET')
  ) {
    return true;
  }

  // Shared-hosting production deliberately excludes whatsapp-web.js and
  // Chromium. Passenger does not always preserve the build-time mode, so a
  // missing variable must never select the unavailable local transport.
  return runtimeEnv('NODE_ENV') === 'production';
}

function workerConfig() {
  const url = runtimeEnv('WHATSAPP_WORKER_URL')?.replace(/\/+$/, '');
  const secret = runtimeEnv('WHATSAPP_WORKER_SECRET');
  if (!url || !secret) {
    throw new Error(
      'WHATSAPP_WORKER_URL and WHATSAPP_WORKER_SECRET are required for remote_worker mode.'
    );
  }
  return { url, secret };
}

async function workerFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | boolean | number> } = {}
): Promise<T> {
  const { url, secret } = workerConfig();
  const endpoint = new URL(`${url}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    endpoint.searchParams.set(key, String(value));
  }

  const response = await fetch(endpoint, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `WhatsApp worker returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const remoteWhatsAppWorker = {
  enabled: isRemoteWorkerMode,

  status(input: {
    accountId: string;
    userId: string;
    autoStart?: boolean;
  }): Promise<WorkerSessionStatus> {
    return workerFetch('/status', {
      query: {
        account_id: input.accountId,
        user_id: input.userId,
        autostart: input.autoStart ?? true,
      },
    });
  },

  restart(input: {
    accountId: string;
    userId: string;
  }): Promise<{ success: true; status: WorkerSessionStatus }> {
    return workerFetch('/restart', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout(input: { accountId: string }): Promise<{ success: true }> {
    return workerFetch('/logout', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  sync(input: {
    accountId: string;
    userId: string;
    chatLimit?: number;
    messageLimit?: number;
  }): Promise<{ success: true } & WorkerSyncResult> {
    return workerFetch('/sync', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  send(input: {
    accountId: string;
    conversationId: string;
    message: WorkerSendInput;
  }): Promise<WorkerSendResult> {
    return workerFetch('/send', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

'use client';

import { useEffect, useState } from 'react';
import { BellRing, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

function decodeKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushNotifications({
  endpoint = '/api/push/subscriptions',
}: {
  endpoint?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);

  useEffect(() => {
    const available =
      window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setSupported(available);
    if (available) {
      navigator.serviceWorker.register('/sw.js').then(async (registration) => {
        setSubscribed(
          Boolean(await registration.pushManager.getSubscription())
        );
      });
    }
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      const keyResponse = await fetch('/api/push/public-key');
      if (!keyResponse.ok) throw new Error('Push indisponível');
      const { publicKey } = (await keyResponse.json()) as { publicKey: string };
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(publicKey),
        }));
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok)
        throw new Error('Não foi possível guardar a subscrição');
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    const prompt = installEvent as Event & { prompt?: () => Promise<void> };
    await prompt.prompt?.();
    setInstallEvent(null);
  }

  if (
    dismissed ||
    (!supported && !installEvent) ||
    (subscribed && !installEvent)
  )
    return null;
  return (
    <div className="border-primary/30 bg-background fixed right-4 bottom-4 z-[80] w-[calc(100vw-2rem)] max-w-sm rounded-xl border p-4 shadow-xl">
      <button
        className="text-muted-foreground absolute top-2 right-2 p-2"
        onClick={() => setDismissed(true)}
        aria-label="Fechar"
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <BellRing className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">Receber notificações no telemóvel</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ative alertas mesmo quando o CRM não estiver aberto.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!subscribed && supported && (
          <Button size="sm" onClick={() => void subscribe()} disabled={busy}>
            Ativar notificações
          </Button>
        )}
        {installEvent && (
          <Button size="sm" variant="outline" onClick={() => void install()}>
            <Download /> Instalar app
          </Button>
        )}
      </div>
    </div>
  );
}

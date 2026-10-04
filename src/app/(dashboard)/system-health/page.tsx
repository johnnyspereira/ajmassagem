'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  ServerCog,
  Smartphone,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Check = {
  id: string;
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
};
type Health = { checkedAt: string; durationMs: number; checks: Check[] };
type WorkerEvent = { at: string; type: string; message: string };

function StatusIcon({ status }: { status?: Check['status'] }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'warning' ? CircleAlert : XCircle;
  const color = status === 'ok' ? 'text-emerald-600' : status === 'warning' ? 'text-amber-600' : 'text-destructive';
  return <Icon className={`size-5 ${color}`} />;
}

function statusLabel(status?: Check['status']) {
  if (status === 'ok') return 'A funcionar';
  if (status === 'warning') return 'Requer atenção';
  if (status === 'error') return 'Indisponível';
  return 'A verificar';
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [response, eventsResponse] = await Promise.all([
        fetch('/api/system/health', { cache: 'no-store' }),
        fetch('/api/whatsapp/baileys/logs', { cache: 'no-store' }),
      ]);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Não foi possível executar o diagnóstico.');
      setHealth(data);
      if (eventsResponse.ok) {
        const eventData = await eventsResponse.json();
        setEvents(Array.isArray(eventData.events) ? eventData.events.slice(0, 8) : []);
      } else {
        setEvents([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível executar o diagnóstico.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
    const interval = window.setInterval(() => void run(), 15_000);
    return () => window.clearInterval(interval);
  }, [run]);

  const worker = health?.checks.find((check) => check.id === 'worker');
  const aiWorker = health?.checks.find((check) => check.id === 'ai-worker');
  const hasError = health?.checks.some((check) => check.status === 'error');
  const hasWarning = health?.checks.some((check) => check.status === 'warning');
  const systemStatus: Check['status'] | undefined = health
    ? hasError ? 'error' : hasWarning ? 'warning' : 'ok'
    : undefined;
  const checksOk = health?.checks.filter((check) => check.status === 'ok').length ?? 0;
  const overview = [
    { label: 'WhatsApp QR', check: worker, icon: Smartphone, hint: 'Mensagens, anexos e Status' },
    { label: 'IA Ollama', check: aiWorker, icon: Bot, hint: 'Correção e rascunhos no Inbox' },
    {
      label: 'Sistema',
      check: systemStatus ? { id: 'system', label: 'Sistema', status: systemStatus, detail: `${checksOk} de ${health?.checks.length ?? 0} verificações saudáveis` } : undefined,
      icon: ServerCog,
      hint: 'A verificar serviços',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-primary text-xs font-semibold tracking-wider">CENTRO OPERACIONAL</p>
          <h1 className="text-foreground text-2xl font-bold">Painel dos Workers</h1>
          <p className="text-muted-foreground mt-1 text-sm">Acompanhe o que mantém o CRM a funcionar. Atualiza automaticamente a cada 15 segundos.</p>
        </div>
        <Button onClick={() => void run()} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          Atualizar agora
        </Button>
      </div>

      {error ? <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {overview.map(({ label, check, icon: Icon, hint }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="size-5" /></div>
                <StatusIcon status={check?.status} />
              </div>
              <p className="mt-4 font-semibold">{label}</p>
              <p className="mt-1 text-sm font-medium">{statusLabel(check?.status)}</p>
              <p className="text-muted-foreground mt-2 text-xs">{check?.detail || hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Clock3 className="size-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Reinício completo</p>
              <p className="text-muted-foreground text-xs">Use o atalho “Reiniciar Workers JP Massagem” na Área de Trabalho para reiniciar os processos locais.</p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">O painel não interrompe conversas nem reinicia o computador.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade recente do WhatsApp</CardTitle>
          <p className="text-muted-foreground text-sm">Eventos recebidos do worker QR. Atualiza com o restante do painel.</p>
        </CardHeader>
        <CardContent>
          {events.length ? (
            <div className="divide-y rounded-lg border">
              {events.map((event, index) => (
                <div className="flex items-start justify-between gap-4 px-3 py-2.5 text-sm" key={`${event.at}-${index}`}>
                  <div><p className="font-medium capitalize">{event.type.replaceAll('_', ' ')}</p><p className="text-muted-foreground mt-0.5">{event.message}</p></div>
                  <time className="text-muted-foreground shrink-0 text-xs">{new Date(event.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">Ainda não há eventos disponíveis. Quando o WhatsApp ligar, sincronizar ou enviar algo, aparecerá aqui.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {health?.checks.map((check) => (
          <Card key={check.id}>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <StatusIcon status={check.status} />
              <CardTitle className="text-base">{check.label}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-muted-foreground text-sm">{check.detail}</p></CardContent>
          </Card>
        ))}
      </div>

      {health ? <p className="text-muted-foreground text-xs">Última verificação: {new Date(health.checkedAt).toLocaleString('pt-PT')} · {health.durationMs} ms</p> : null}
    </div>
  );
}

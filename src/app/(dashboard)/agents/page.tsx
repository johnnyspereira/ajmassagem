'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  Sparkles,
  Settings2,
  BarChart3,
  ShieldCheck,
  Zap,
  Languages,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';

type Tab = 'playground' | 'setup' | 'usage';
type AiStatus = {
  configured: boolean;
  provider?: string;
  model?: string;
  is_active?: boolean;
  auto_reply_enabled?: boolean;
};

export default function AgentsPage() {
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);
  const [status, setStatus] = useState<AiStatus>({ configured: false });

  // Land first-time users on Setup, returning users on the Playground.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/config');
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setStatus(data ?? { configured: false });
          setTab(data?.configured ? 'playground' : 'setup');
        }
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="text-primary h-6 w-6" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Agentes de IA
        </h1>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Seu agente de IA com sua própria chave — configure-o e depois teste-o no
        ambiente de testes antes de responder aos clientes na caixa de entrada.
      </p>

      {decided && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="border-border bg-card rounded-xl border p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="text-primary h-4 w-4" /> Ligação
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {status.configured
                ? `${status.provider ?? 'IA'} · ${status.model ?? 'modelo configurado'}`
                : 'Nenhuma IA configurada ainda'}
            </p>
          </div>
          <div className="border-border bg-card rounded-xl border p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="text-primary h-4 w-4" /> Respostas automáticas
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {status.is_active && status.auto_reply_enabled
                ? 'Ativas para conversas não atribuídas'
                : 'Desativadas — nenhum cliente recebe resposta automática'}
            </p>
          </div>
          <div className="border-border bg-card rounded-xl border p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Languages className="text-primary h-4 w-4" /> Inbox
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Rascunhos e traduções são sempre revistos antes do envio.
            </p>
          </div>
        </div>
      )}

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mt-6"
        >
          <TabsList>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> Ambiente de testes
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> Configuração
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> Uso
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground onGoToSetup={() => setTab('setup')} />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            <AiConfig />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

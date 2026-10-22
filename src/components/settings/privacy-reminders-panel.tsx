'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsPanelHead } from './settings-panel-head';
type Client = {
  id: string;
  name: string;
  phone: string;
  whatsapp_consent: boolean | null;
  privacy_review_status: string;
  consent_reviewed_at: string | null;
  last_sent_at: string | null;
  last_error: string | null;
};
export function PrivacyRemindersPanel() {
  const [data, setData] = useState<{
    enabled: boolean;
    clients: Client[];
  } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch('/api/account/privacy-reminders', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao carregar');
      setData(result);
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(body: { enabled?: boolean; contactId?: string }) {
    if (
      !window.confirm(
        body.contactId
          ? 'Enviar agora um lembrete de revisão das preferências pelo WhatsApp?'
          : body.enabled
            ? 'Ativar lembretes automáticos? Apenas clientes com WhatsApp autorizado e revisão antiga por confirmar serão contactados, no máximo uma vez a cada sete dias.'
            : 'Desativar os lembretes automáticos?'
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch('/api/account/privacy-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha na operação');
      toast.success(
        body.contactId
          ? 'Mensagem aceite pelo canal WhatsApp. Isto não comprova leitura.'
          : 'Automatismo atualizado.'
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha na operação');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <SettingsPanelHead
        title="Revisão de dados e privacidade"
        description="Acompanhe os clientes com Portal ativo e convide-os a permitir ou recusar as suas opções, sem alterar as escolhas por eles."
        action={
          <Button variant="outline" onClick={() => void load()}>
            Atualizar
          </Button>
        }
      />
      <div className="bg-card space-y-3 rounded-2xl border p-4">
        <h3 className="font-semibold">
          Lembretes automáticos {data?.enabled ? 'ativos' : 'desativados'}
        </h3>
        <p className="text-muted-foreground text-sm">
          Desativados por defeito. Quando ativos, o cron local verifica clientes
          com revisão antiga por confirmar e WhatsApp autorizado. Intervalo
          mínimo de sete dias por cliente. Recusas de WhatsApp são respeitadas.
        </p>
        {data && (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void act({ enabled: !data.enabled })}
          >
            {data.enabled ? 'Desativar automatismo' : 'Ativar automatismo'}
          </Button>
        )}
      </div>
      <details className="bg-card rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Mensagem enviada ao cliente
        </summary>
        <p className="mt-3 whitespace-pre-line">
          Olá, [primeiro nome]. Aqui é da JP Massagem. Pedimos que reveja os
          seus dados e preferências de privacidade no Portal 360. Pode permitir
          ou recusar cada opção, conforme a sua vontade. Aceda ao Portal e abra
          Perfil → Privacidade e comunicações: [link do Portal]. Obrigado.
        </p>
      </details>
      {error && (
        <p role="alert" className="text-destructive rounded-xl border p-4">
          {error} Reinicie a aplicação após atualizar para instalar a base deste
          painel.
        </p>
      )}
      <Input
        aria-label="Pesquisar clientes do Portal"
        placeholder="Pesquisar nome ou telefone…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">
        Até 1000 clientes com Portal ativo. O envio manual também respeita
        recusas e o intervalo mínimo de sete dias.
      </p>
      {data?.clients
        .filter((client) =>
          `${client.name} ${client.phone}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((client) => (
          <article
            key={client.id}
            className="bg-card flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
          >
            <div className="min-w-0">
              <Link
                href={`/contacts/${client.id}?tab=profile`}
                className="font-semibold hover:underline"
              >
                {client.name || client.phone}
              </Link>
              <p className="text-muted-foreground mt-1 text-xs">
                {client.privacy_review_status === 'current' &&
                client.consent_reviewed_at !== null
                  ? 'Preferências revistas'
                  : client.privacy_review_status === 'withdrawn'
                    ? 'Autorização retirada'
                    : 'Por rever'}{' '}
                · WhatsApp:{' '}
                {client.whatsapp_consent === true
                  ? 'autorizado'
                  : client.whatsapp_consent === false
                    ? 'recusado'
                    : 'sem definição'}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Último lembrete aceite:{' '}
                {client.last_sent_at
                  ? new Date(client.last_sent_at).toLocaleString('pt-PT', {
                      timeZone: 'Europe/Lisbon',
                    })
                  : 'sem registo'}
              </p>
              {client.last_error && (
                <p className="text-destructive mt-1 text-xs break-words">
                  {client.last_error}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              disabled={
                busy ||
                !client.phone ||
                client.whatsapp_consent === false ||
                (client.privacy_review_status === 'current' &&
                  client.consent_reviewed_at !== null) ||
                client.privacy_review_status === 'withdrawn'
              }
              onClick={() => void act({ contactId: client.id })}
            >
              Enviar lembrete
            </Button>
          </article>
        ))}
      {data && !data.clients.length && (
        <p className="text-muted-foreground p-6 text-center text-sm">
          Sem clientes com Portal ativo.
        </p>
      )}
    </section>
  );
}

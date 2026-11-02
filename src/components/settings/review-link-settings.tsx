'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Save, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  normalizeReviewUrl,
  parseReviewMode,
  type ReviewLinkMode,
} from '@/lib/clinic/review-link';

export function ReviewLinkSettings() {
  const { accountId, canEditSettings } = useAuth();
  const [mode, setMode] = useState<ReviewLinkMode>('system'),
    [url, setUrl] = useState('');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading'),
    [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [savedKey, setSavedKey] = useState('');
  useEffect(() => {
    if (!accountId || !canEditSettings) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setPhase('loading');
        setError('');
      }
    });
    fetch('/api/clinic/review-settings', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Error(
            data.error || 'Não foi possível carregar a configuração.'
          );
        if (controller.signal.aborted) return;
        const selected = parseReviewMode(data.mode);
        setMode(selected);
        setUrl(data.googleUrl || '');
        setSavedKey(
          `${selected}:${selected === 'google' ? data.googleUrl : ''}`
        );
        setPhase('ready');
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : 'Falha ao carregar. Tente novamente.'
          );
          setPhase('error');
        }
      });
    return () => controller.abort();
  }, [accountId, canEditSettings, version]);
  if (!canEditSettings) return null;
  let externalUrl = '',
    urlError = '';
  if (mode === 'google') {
    try {
      externalUrl = normalizeReviewUrl(url);
    } catch (e) {
      urlError = e instanceof Error ? e.message : 'Endereço inválido.';
    }
  }
  const dirty = savedKey !== `${mode}:${mode === 'google' ? url : ''}`;
  async function save() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/clinic/review-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          ...(mode === 'google' ? { googleUrl: externalUrl } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível guardar.');
      if (mode === 'google') setUrl(data.googleUrl);
      setSavedKey(`${mode}:${mode === 'google' ? data.googleUrl : ''}`);
      setNotice(
        'Destino guardado. Será usado nos próximos pedidos de avaliação.'
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Falha ao guardar. Tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      id="review-link"
      className="bg-card scroll-mt-28 space-y-5 rounded-xl border p-4 sm:p-5"
      aria-labelledby="review-link-title"
      aria-busy={phase === 'loading' || saving}
    >
      <div className="flex items-start gap-3">
        <Star className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <h2 id="review-link-title" className="text-lg font-semibold">
            Link de avaliação ao concluir
          </h2>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm">
            Escolha onde o cliente vai avaliar a sessão. A escolha é aplicada
            quando o pedido de avaliação é enviado depois de concluir o
            atendimento.
          </p>
        </div>
      </div>
      {phase === 'loading' && (
        <p role="status" className="text-muted-foreground text-sm">
          A carregar o destino guardado…
        </p>
      )}
      {phase === 'error' && (
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          Tentar carregar novamente
        </Button>
      )}
      {phase === 'ready' && (
        <>
          <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Destino da avaliação</legend>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mode === 'system' ? 'border-primary bg-primary/5' : ''}`}
            >
              <input
                type="radio"
                name="review-mode"
                value="system"
                checked={mode === 'system'}
                onChange={() => {
                  setMode('system');
                  setNotice('');
                }}
                className="accent-primary mt-1 size-4 shrink-0"
              />
              <span>
                <strong className="block text-sm">Avaliação do sistema</strong>
                <span className="text-muted-foreground mt-1 block text-sm">
                  Ligação pessoal para cada atendimento. As respostas ficam no
                  CRM.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mode === 'google' ? 'border-primary bg-primary/5' : ''}`}
            >
              <input
                type="radio"
                name="review-mode"
                value="google"
                checked={mode === 'google'}
                onChange={() => {
                  setMode('google');
                  setNotice('');
                }}
                className="accent-primary mt-1 size-4 shrink-0"
              />
              <span>
                <strong className="block text-sm">Google / link externo</strong>
                <span className="text-muted-foreground mt-1 block text-sm">
                  O endereço que escolher. As avaliações ficam no serviço de
                  destino.
                </span>
              </span>
            </label>
          </fieldset>
          {mode === 'google' && (
            <div className="space-y-2">
              <label
                htmlFor="google-review-url"
                className="text-sm font-medium"
              >
                Link de avaliação
              </label>
              <Input
                id="google-review-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                className="min-h-11 text-base sm:text-sm"
                placeholder="https://…"
                maxLength={2048}
                value={url}
                disabled={saving}
                aria-describedby="review-url-help"
                aria-invalid={Boolean(url && urlError)}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setNotice('');
                }}
              />
              <p id="review-url-help" className="text-muted-foreground text-xs">
                Cole a ligação completa, por exemplo o link direto para avaliar
                a empresa no Google.
              </p>
              {url && urlError && (
                <p className="text-destructive text-sm">{urlError}</p>
              )}
            </div>
          )}
          <div className="bg-muted/50 rounded-lg p-4 text-sm">
            <h3 className="font-medium">O que será enviado</h3>
            {mode === 'system' ? (
              <p className="text-muted-foreground mt-2">
                O sistema gera automaticamente a ligação pessoal de avaliação
                para o cliente e a sessão.
              </p>
            ) : externalUrl ? (
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary mt-2 inline-flex min-h-11 max-w-full items-center gap-2 underline underline-offset-4"
              >
                <span className="min-w-0 break-all">{externalUrl}</span>
                <ExternalLink className="size-4 shrink-0" />
                <span className="sr-only">Abrir ligação numa nova janela</span>
              </a>
            ) : (
              <p className="text-muted-foreground mt-2">
                Introduza um endereço HTTPS válido para pré-visualizar a
                ligação.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground max-w-[65ch] text-xs">
              Aplica-se a novos pedidos; não reenvia mensagens já enviadas.
              Mantenha <code>{'{link_avaliacao}'}</code> no modelo Pedido de
              avaliação abaixo.
            </p>
            <Button
              className="min-h-11"
              disabled={saving || !dirty || Boolean(urlError)}
              onClick={() => void save()}
            >
              <Save className="size-4" />
              {saving ? 'A guardar…' : 'Guardar destino'}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
        >
          {notice}
        </p>
      )}
    </section>
  );
}

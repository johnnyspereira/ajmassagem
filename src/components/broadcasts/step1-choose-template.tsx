'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MessageTemplate, QuickReply } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  FileText,
  ArrowRight,
  MessageSquare,
  Zap,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import {
  type BroadcastTemplate,
  isInternalBroadcastTemplate,
  markMetaBroadcastTemplate,
  quickReplyToBroadcastTemplate,
} from '@/lib/broadcasts/templates';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

interface Step1Props {
  selectedTemplate: BroadcastTemplate | null;
  onSelect: (template: BroadcastTemplate) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({
  selectedTemplate,
  onSelect,
  onNext,
  onBack,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  async function submitDraft() {
    if (!draftText.trim()) return toast.error('Escreva a mensagem para enviar pelo QR.');
    const title = draftTitle.trim() || 'Mensagem de transmissão';
    setSavingDraft(true);
    try {
      let created: BroadcastTemplate = {
        id: `broadcast-draft:${crypto.randomUUID()}`,
        user_id: '', name: title, category: 'Utility', language: 'internal',
        body_text: draftText.trim(), status: 'APPROVED', created_at: new Date().toISOString(),
        broadcast_template_source: 'internal', internal_kind: 'text', interactive_payload: null,
      };
      if (saveAsTemplate) {
        const response = await fetch('/api/quick-replies', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, kind: 'text', content_text: draftText.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível guardar o modelo.');
        created = quickReplyToBroadcastTemplate(data.quick_reply as QuickReply);
        setTemplates((current) => [created, ...current]);
        toast.success('Modelo QR guardado e pronto para reutilizar.');
      }
      onSelect(created);
      setCreating(false);
      onNext();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível criar a mensagem.');
    } finally { setSavingDraft(false); }
  }

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        const [metaRes, internalRes] = await Promise.all([
          supabase
            .from('message_templates')
            .select('*')
            .eq('status', 'APPROVED')
            .order('created_at', { ascending: false }),
          fetch('/api/quick-replies', { cache: 'no-store' }),
        ]);

        if (metaRes.error) throw metaRes.error;

        const internalData = internalRes.ok
          ? await internalRes.json().catch(() => ({}))
          : {};
        const metaTemplates = ((metaRes.data ?? []) as MessageTemplate[]).map(
          markMetaBroadcastTemplate
        );
        const internalTemplates = (
          (internalData.quick_replies as QuickReply[] | undefined) ?? []
        )
          .filter((reply) =>
            reply.kind === 'interactive'
              ? Boolean(reply.interactive_payload)
              : Boolean(reply.content_text?.trim())
          )
          .map(quickReplyToBroadcastTemplate);

        setTemplates([...internalTemplates, ...metaTemplates]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('chooseTemplate.errorLoad')
        );
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, [t]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-primary h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">
          {t('chooseTemplate.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('chooseTemplate.subtitle')}
        </p>
      </div>

      <div className="border-primary/30 bg-primary/5 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Criar mensagem para QR</p>
            <p className="text-muted-foreground text-xs">Escreva agora e escolha se quer guardar como modelo reutilizável.</p>
          </div>
          <Button type="button" variant={creating ? 'outline' : 'default'} onClick={() => setCreating((value) => !value)}>
            <Plus className="mr-1 h-4 w-4" />{creating ? 'Fechar' : 'Criar mensagem'}
          </Button>
        </div>
        {creating && <div className="mt-4 space-y-3">
          <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Nome do modelo (opcional se não guardar)" maxLength={80} />
          <Textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} placeholder="Mensagem a enviar pelo WhatsApp QR. Pode usar {{name}}, {{phone}}, {{email}} ou {{company}}." rows={5} />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={saveAsTemplate} onChange={(event) => setSaveAsTemplate(event.target.checked)} /> Guardar também como modelo QR para futuras transmissões e Inbox</label>
          <div className="flex justify-end"><Button type="button" disabled={savingDraft} onClick={() => void submitDraft()}>{savingDraft ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{saveAsTemplate ? 'Guardar e continuar' : 'Usar apenas nesta transmissão'}</Button></div>
        </div>}
      </div>

      {templates.length === 0 ? (
        <div className="border-border bg-card/50 flex h-48 flex-col items-center justify-center rounded-xl border">
          <FileText className="text-muted-foreground mb-2 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            {t('chooseTemplate.noTemplates')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('chooseTemplate.createFirst')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            const isInternal = isInternalBroadcastTemplate(template);
            const catColor = isInternal
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : (categoryColors[template.category] ?? categoryColors.Utility);
            const Icon = isInternal
              ? template.internal_kind === 'interactive'
                ? Zap
                : MessageSquare
              : FileText;

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'border-border bg-card/50 hover:border-border hover:bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="text-primary h-4 w-4 shrink-0" />
                    <h3 className="text-foreground truncate text-sm font-medium">
                      {template.name}
                    </h3>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                  >
                    {isInternal
                      ? t('chooseTemplate.internalChip')
                      : template.category}
                  </span>
                </div>
                <p className="text-muted-foreground line-clamp-3 text-xs">
                  {template.body_text}
                </p>
                <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                  <span>
                    {isInternal
                      ? t('chooseTemplate.qrDelivery')
                      : (template.language ?? 'en_US')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-border flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedTemplate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

'use client';
import { useState, useRef } from 'react';
import {
  Loader2,
  Save,
  RotateCcw,
  Leaf,
  MessageCircle,
  Clock3,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_LEAD_SETTINGS,
  LEAD_MESSAGES,
  LEAD_VARIABLES,
  parseLeadSettings,
  type LeadMessageKind,
  type LeadWorkflowSettings,
} from '@/lib/contacts/lead-workflow';

export function LeadSettingsDialog({
  settings,
  canEdit,
  onSaved,
  onClose,
}: {
  settings: LeadWorkflowSettings;
  canEdit: boolean;
  onSaved: (value: LeadWorkflowSettings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => structuredClone(settings));
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<LeadMessageKind>('first_contact');
  const lock = useRef(false);
  async function save() {
    if (lock.current || !canEdit) return;
    const parsed = parseLeadSettings(value);
    if (!parsed)
      return toast.error(
        'Reveja os prazos e os textos. Use apenas as variáveis indicadas e até 2.000 caracteres por mensagem.'
      );
    lock.current = true;
    setSaving(true);
    try {
      const response = await fetch('/api/leads/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const result = await response.json();
      if (!response.ok || !result.settings)
        throw new Error(
          result.error || 'Não foi possível guardar as configurações.'
        );
      onSaved(result.settings);
      toast.success('Configurações de acompanhamento guardadas para a conta.');
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível guardar.'
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-5xl [&>button]:text-white [&_input]:focus-visible:border-[#bfa16a] [&_input]:focus-visible:ring-[#bfa16a]/25">
        <DialogHeader className="rounded-t-2xl bg-[#073d39] px-6 py-6 pr-12 text-white">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-[#edcf94] uppercase">
            <Leaf className="size-4" /> JP Massagem · Relacionamento
          </div>
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            O cuidado continua na conversa.
          </DialogTitle>
          <DialogDescription className="max-w-xl text-sm leading-relaxed text-white/75">
            Mensagens pessoais, no momento certo. Prepare cada convite com a
            atenção que dedica a cada sessão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 p-5 sm:p-6">
          {!canEdit && (
            <p className="text-muted-foreground text-sm">
              Pode consultar os textos. Apenas o proprietário e os
              administradores podem alterar estas configurações.
            </p>
          )}
          <div className="bg-muted/20 grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-recovery-days">
                <Clock3 className="size-4" /> Retomar o cuidado após
              </Label>
              <Input
                id="lead-recovery-days"
                type="number"
                min={1}
                max={3650}
                value={value.recoveryDays}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  setValue((previous) => ({
                    ...previous,
                    recoveryDays: Number(event.target.value),
                  }))
                }
              />
              <p className="text-muted-foreground text-xs">
                Dias desde a última sessão.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-followup-days">
                Voltar a contactar após
              </Label>
              <Input
                id="lead-followup-days"
                type="number"
                min={1}
                max={365}
                value={value.followupDays}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  setValue((previous) => ({
                    ...previous,
                    followupDays: Number(event.target.value),
                  }))
                }
              />
              <p className="text-muted-foreground text-xs">
                Dias de intervalo sugerido entre contactos.
              </p>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
            <nav
              aria-label="Tipos de mensagem"
              className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible"
            >
              {(Object.keys(LEAD_MESSAGES) as LeadMessageKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={selected === kind}
                  onClick={() => setSelected(kind)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition-colors ${selected === kind ? 'border-[#bfa16a] bg-[#073d39] text-white' : 'bg-muted/30 text-muted-foreground hover:bg-muted border-transparent'}`}
                >
                  <MessageCircle className="size-4 shrink-0" />
                  {LEAD_MESSAGES[kind]}
                </button>
              ))}
            </nav>
            <div className="min-w-0 space-y-4">
              {[selected].map((kind) => (
                <div key={kind} className="space-y-2">
                  <Label htmlFor={`lead-template-${kind}`}>
                    {LEAD_MESSAGES[kind]}
                  </Label>
                  <Textarea
                    id={`lead-template-${kind}`}
                    className="min-h-60 resize-y rounded-xl p-4 text-sm leading-relaxed focus-visible:border-[#bfa16a] focus-visible:ring-[#bfa16a]/25"
                    rows={9}
                    value={value.templates[kind]}
                    maxLength={2000}
                    disabled={!canEdit || saving}
                    onChange={(event) =>
                      setValue((previous) => ({
                        ...previous,
                        templates: {
                          ...previous.templates,
                          [kind]: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
              <details className="text-muted-foreground rounded-xl border p-3 text-xs">
                <summary className="text-foreground cursor-pointer font-medium">
                  Personalizar com dados do cliente
                </summary>
                <p className="mt-2 leading-relaxed">
                  Estes campos são preenchidos quando preparar a mensagem para
                  um cliente.
                </p>
                <p className="mt-2 leading-relaxed break-words">
                  {LEAD_VARIABLES.map((key) => `{${key}}`).join(' · ')}
                </p>
              </details>
              <div className="rounded-xl border border-[#bfa16a]/40 bg-[#bfa16a]/5 p-4">
                <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
                  Pré-visualização · Exemplo ilustrativo
                </p>
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {value.templates[selected].replace(
                    /\{([^{}]+)\}/g,
                    (match, key: string) =>
                      ({
                        primeiro_nome: 'Alex',
                        nome: 'Alex',
                        empresa: 'JP Massagem',
                        dias_sem_sessao: '60',
                        ultima_sessao: '20 de agosto',
                        dias_validade: '14',
                      })[key] ?? match
                  )}
                </p>
              </div>
              <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
                <Check className="mt-0.5 size-4 shrink-0" />
                Pode rever cada mensagem antes do envio. Guardar os textos não
                envia mensagens aos clientes.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter className="m-0 flex-wrap rounded-b-2xl p-4">
          <Button
            variant="ghost"
            disabled={!canEdit || saving}
            onClick={() =>
              setValue((previous) => ({
                ...previous,
                templates: structuredClone(DEFAULT_LEAD_SETTINGS.templates),
              }))
            }
          >
            <RotateCcw className="size-4" /> Usar textos JP Massagem
          </Button>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Fechar
          </Button>
          <Button
            className="bg-[#073d39] text-white hover:bg-[#0b514b]"
            disabled={!canEdit || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}{' '}
            Guardar configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

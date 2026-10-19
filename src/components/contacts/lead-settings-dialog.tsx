'use client';
import { useState, useRef } from 'react';
import { Loader2, Save, RotateCcw } from 'lucide-react';
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mensagens e tratativa dos Leads</DialogTitle>
          <DialogDescription>
            Defina quando recuperar um cliente e os textos que a equipa pode
            personalizar antes de enviar.
          </DialogDescription>
        </DialogHeader>
        {!canEdit && (
          <p className="text-muted-foreground text-sm">
            Pode consultar os textos. Apenas o proprietário e os administradores
            podem alterar estas configurações.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lead-recovery-days">
              Recuperar após quantos dias sem sessão?
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-followup-days">
              Sugerir novo contacto após quantos dias?
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
          </div>
        </div>
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="text-xs font-medium">
            Variáveis substituídas pelos dados do cliente
          </p>
          <p className="text-muted-foreground mt-2 text-xs break-words">
            {LEAD_VARIABLES.map((key) => `{${key}}`).join(' · ')}
          </p>
        </div>
        <div className="space-y-5">
          {(Object.keys(LEAD_MESSAGES) as LeadMessageKind[]).map((kind) => (
            <div key={kind} className="space-y-2">
              <Label htmlFor={`lead-template-${kind}`}>
                {LEAD_MESSAGES[kind]}
              </Label>
              <Textarea
                id={`lead-template-${kind}`}
                rows={4}
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
        </div>
        <DialogFooter className="flex-wrap">
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
            <RotateCcw className="size-4" /> Repor textos sugeridos
          </Button>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!canEdit || saving} onClick={() => void save()}>
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

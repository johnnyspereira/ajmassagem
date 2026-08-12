'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellRing, Clock3, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';

type Settings = {
  payables_enabled: boolean;
  payable_days_before: number[];
  overdue_daily: boolean;
  cash_enabled: boolean;
  timezone: string;
  cash_open_time: string;
  cash_close_time: string;
  close_repeat_minutes: number;
  whatsapp_enabled: boolean;
  whatsapp_phone: string;
};
const defaults: Settings = {
  payables_enabled: true,
  payable_days_before: [7, 3, 1],
  overdue_daily: true,
  cash_enabled: true,
  timezone: 'Europe/Lisbon',
  cash_open_time: '09:00',
  cash_close_time: '22:00',
  close_repeat_minutes: 30,
  whatsapp_enabled: true,
  whatsapp_phone: '+351935864343',
};

export function FinanceReminderSettings({ accountId }: { accountId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [value, setValue] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('finance_reminder_settings')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle();
      if (!error && data)
        setValue({
          ...defaults,
          ...data,
          cash_open_time: String(data.cash_open_time).slice(0, 5),
          cash_close_time: String(data.cash_close_time).slice(0, 5),
        });
      setLoading(false);
    })();
  }, [accountId, supabase]);
  const toggleDay = (day: number) =>
    setValue((current) => ({
      ...current,
      payable_days_before: current.payable_days_before.includes(day)
        ? current.payable_days_before.filter((item) => item !== day)
        : [...current.payable_days_before, day].sort((a, b) => b - a),
    }));
  async function save() {
    if (!value.payable_days_before.length)
      return toast.error('Escolha pelo menos um aviso antecipado.');
    if (
      value.whatsapp_enabled &&
      !/^\+?[1-9]\d{6,14}$/.test(value.whatsapp_phone)
    )
      return toast.error(
        'Informe o WhatsApp no formato internacional, por exemplo +351935864343.'
      );
    setSaving(true);
    const { error } = await supabase
      .from('finance_reminder_settings')
      .upsert(
        { account_id: accountId, ...value },
        { onConflict: 'account_id' }
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Automações financeiras guardadas e ativas.');
  }
  if (loading)
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin" />
        </CardContent>
      </Card>
    );
  return (
    <Card className="overflow-hidden border-violet-500/30 bg-gradient-to-br from-violet-500/5 via-transparent to-emerald-500/5">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="text-violet-500" />
              Central de automações financeiras
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">
              Alertas no CRM e push no telemóvel, com deteção automática de
              abertura, fecho e pagamento.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="size-4" />
            Anti-duplicação ativa
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-2">
        <section className="bg-background/70 space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Contas a pagar</p>
              <p className="text-muted-foreground text-xs">
                Antecipa, alerta no dia e acompanha atrasos.
              </p>
            </div>
            <Switch
              checked={value.payables_enabled}
              onCheckedChange={(checked) =>
                setValue({ ...value, payables_enabled: checked })
              }
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium">
              Avisar antes do vencimento
            </p>
            <div className="flex flex-wrap gap-2">
              {[30, 14, 7, 3, 1].map((day) => (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={
                    value.payable_days_before.includes(day)
                      ? 'default'
                      : 'outline'
                  }
                  onClick={() => toggleDay(day)}
                >
                  {day} dia{day > 1 ? 's' : ''}
                </Button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <strong>Cobrar contas atrasadas diariamente</strong>
              <span className="text-muted-foreground block text-xs">
                Para automaticamente quando a conta for paga ou cancelada.
              </span>
            </span>
            <Switch
              checked={value.overdue_daily}
              onCheckedChange={(checked) =>
                setValue({ ...value, overdue_daily: checked })
              }
            />
          </label>
        </section>
        <section className="bg-background/70 space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Disciplina automática do caixa</p>
              <p className="text-muted-foreground text-xs">
                Só alerta quando a ação ainda está pendente.
              </p>
            </div>
            <Switch
              checked={value.cash_enabled}
              onCheckedChange={(checked) =>
                setValue({ ...value, cash_enabled: checked })
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs">
              Abrir às
              <Input
                className="mt-1"
                type="time"
                value={value.cash_open_time}
                onChange={(e) =>
                  setValue({ ...value, cash_open_time: e.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Fechar até
              <Input
                className="mt-1"
                type="time"
                value={value.cash_close_time}
                onChange={(e) =>
                  setValue({ ...value, cash_close_time: e.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Repetir (min)
              <Input
                className="mt-1"
                type="number"
                min={5}
                max={240}
                value={value.close_repeat_minutes}
                onChange={(e) =>
                  setValue({
                    ...value,
                    close_repeat_minutes: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label className="text-xs">
            Fuso horário
            <Input
              className="mt-1"
              value={value.timezone}
              onChange={(e) => setValue({ ...value, timezone: e.target.value })}
            />
          </label>
          <p className="text-muted-foreground flex gap-2 text-xs">
            <Clock3 className="size-4 shrink-0" />
            Após o limite de fecho, o alerta repete até o sistema detetar o
            caixa fechado.
          </p>
        </section>
        <div className="flex flex-wrap items-center gap-3 xl:col-span-2">
          <div className="bg-background/70 flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4">
            <Switch
              checked={value.whatsapp_enabled}
              onCheckedChange={(checked) =>
                setValue({ ...value, whatsapp_enabled: checked })
              }
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Enviar tambÃ©m por WhatsApp</p>
              <p className="text-muted-foreground text-xs">
                Usa a sessÃ£o conectada e regista cada entrega.
              </p>
            </div>
            <Input
              className="max-w-52"
              placeholder="+351935864343"
              value={value.whatsapp_phone}
              onChange={(event) =>
                setValue({
                  ...value,
                  whatsapp_phone: event.target.value.replace(/[\s()-]/g, ''),
                })
              }
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}Guardar e
            ativar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

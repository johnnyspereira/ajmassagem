'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

const defaults = {
  confirmation: '✨ *Detalhes da sua marcação* ✨\nOlá, {cliente} 😊\n\n💆 *Serviço:* {servico}\n📅 *Data:* {data}\n🕙 *Horário:* {hora}\n🎟️ {beneficio}\n🙎🏻‍♂️ *Profissional:* {profissional}\n📍 *Morada:* {morada}\n\nPara confirmar responda *CONFIRMAR*. Para alterar responda *REAGENDAR*.\n\n{link_anamnese}\n\n*{empresa}*',
  reminder: 'Olá, {cliente}. 😊\n\nLembramos a sua sessão de *{servico}* em {data}, às {hora}.\n{beneficio}\n\nCaso necessite de apoio, responda a esta mensagem.\n\n*{empresa}*',
  pending_confirmation: 'Olá, {cliente}. 😊\n\nAinda aguardamos a confirmação da sua sessão de *{servico}*, em {data}, às {hora}.\n\nResponda *CONFIRMAR* ou *REAGENDAR*.\n\n*{empresa}*',
};

export function AutomatedMessagesSettings() {
  const { accountId } = useAuth();
  const db = createClient();
  const [messages, setMessages] = useState(defaults);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!accountId) return; void db.from('clinic_communication_settings').select('automated_message_templates').eq('account_id', accountId).maybeSingle().then(({ data }) => { if (data?.automated_message_templates) setMessages({ ...defaults, ...(data.automated_message_templates as Partial<typeof defaults>) }); }); }, [accountId, db]);
  async function save() { if (!accountId) return; setSaving(true); const { error } = await db.from('clinic_communication_settings').upsert({ account_id: accountId, automated_message_templates: messages }, { onConflict: 'account_id' }); setSaving(false); if (error) return toast.error(error.message); toast.success('Modelos automáticos guardados.'); }
  return <section className="space-y-5 rounded-lg border bg-card p-5"><div><h2 className="font-semibold">Mensagens automáticas</h2><p className="text-muted-foreground text-sm">Edite os textos enviados automaticamente. Variáveis: {'{cliente}'}, {'{servico}'}, {'{data}'}, {'{hora}'}, {'{beneficio}'}, {'{profissional}'}, {'{morada}'}, {'{link_anamnese}'}, {'{empresa}'}.</p></div>{(Object.keys(defaults) as Array<keyof typeof defaults>).map((key) => <label key={key} className="block space-y-2"><span className="font-medium">{{ confirmation: 'Confirmação de marcação', reminder: 'Lembrete de sessão', pending_confirmation: 'Confirmação pendente' }[key]}</span><Textarea className="min-h-48" value={messages[key]} onChange={(e) => setMessages((current) => ({ ...current, [key]: e.target.value }))} /></label>)}<Button onClick={() => void save()} disabled={saving}><Save />{saving ? 'A guardar...' : 'Guardar modelos'}</Button></section>;
}

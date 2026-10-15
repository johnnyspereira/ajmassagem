'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, Megaphone, Search, Users, VenusAndMars } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Contact } from '@/types';

type BenefitRow = { owner_contact_id: string | null; status: string; expires_at: string | null; remaining_uses?: number | null; current_balance?: number | null; voucher_type?: string | null };
type PackRow = { contact_id: string | null; status: string; expires_at: string | null };
type AppointmentRow = { contact_id: string | null; scheduled_start: string; status: string };
type Filter = 'all' | 'male' | 'female' | 'expiring' | 'no_appointment' | 'marketing_ready';

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function LeadsWorkspacePage() {
  const router = useRouter();
  const { accountId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [vouchers, setVouchers] = useState<BenefitRow[]>([]);
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const db = createClient();
    const [contactsRes, vouchersRes, packsRes, appointmentsRes] = await Promise.all([
      db.from('contacts').select('*').eq('account_id', accountId).order('created_at', { ascending: false }).limit(2000),
      db.from('finance_vouchers').select('owner_contact_id,status,expires_at,remaining_uses,current_balance,voucher_type').eq('account_id', accountId).limit(5000),
      db.from('finance_client_packs').select('contact_id,status,expires_at').eq('account_id', accountId).limit(5000),
      db.from('clinic_appointments').select('contact_id,scheduled_start,status').eq('account_id', accountId).limit(5000),
    ]);
    const error = contactsRes.error || vouchersRes.error || packsRes.error || appointmentsRes.error;
    if (error) toast.error(`Não foi possível carregar os Leads: ${error.message}`);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setVouchers((vouchersRes.data ?? []) as BenefitRow[]);
    setPacks((packsRes.data ?? []) as PackRow[]);
    setAppointments((appointmentsRes.data ?? []) as AppointmentRow[]);
    setLoading(false);
  }, [accountId]);

  // This first load is intentionally driven by the account context becoming available.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => contacts.map((contact) => {
    const contactVouchers = vouchers.filter((item) => item.owner_contact_id === contact.id && item.status === 'active');
    const contactPacks = packs.filter((item) => item.contact_id === contact.id && item.status === 'active');
    const expiring = [...contactVouchers, ...contactPacks].map((item) => daysUntil(item.expires_at)).filter((days): days is number => days !== null && days >= 0 && days <= 30).sort((a, b) => a - b)[0];
    const hasUpcoming = appointments.some((item) => item.contact_id === contact.id && !['cancelled', 'no_show'].includes(item.status) && new Date(item.scheduled_start).getTime() >= Date.now());
    return { contact, expiring, hasUpcoming, benefits: contactVouchers.length + contactPacks.length, ready: Boolean(contact.phone && contact.marketing_whatsapp_consent && contact.privacy_review_status === 'current') };
  }), [appointments, contacts, packs, vouchers]);

  const visible = useMemo(() => rows.filter((row) => {
    const search = query.trim().toLocaleLowerCase('pt-PT');
    if (search && ![row.contact.name, row.contact.phone, row.contact.email, row.contact.company].filter(Boolean).join(' ').toLocaleLowerCase('pt-PT').includes(search)) return false;
    if (filter === 'male') return row.contact.gender === 'male';
    if (filter === 'female') return row.contact.gender === 'female';
    if (filter === 'expiring') return row.expiring !== undefined;
    if (filter === 'no_appointment') return !row.hasUpcoming;
    if (filter === 'marketing_ready') return row.ready;
    return true;
  }), [filter, query, rows]);

  const counts = useMemo(() => ({ male: rows.filter((row) => row.contact.gender === 'male').length, female: rows.filter((row) => row.contact.gender === 'female').length, expiring: rows.filter((row) => row.expiring !== undefined).length, noAppointment: rows.filter((row) => !row.hasUpcoming).length, ready: rows.filter((row) => row.ready).length }), [rows]);
  const allVisible = visible.length > 0 && visible.every((row) => selected.has(row.contact.id));

  function toggleAll(value: boolean) {
    setSelected((current) => { const next = new Set(current); visible.forEach((row) => { if (value) next.add(row.contact.id); else next.delete(row.contact.id); }); return next; });
  }
  function beginBroadcast() {
    if (!selected.size) return toast.error('Selecione pelo menos um contacto para o disparo.');
    const eligible = rows.filter((row) => selected.has(row.contact.id) && row.ready).map((row) => row.contact.id);
    if (!eligible.length) return toast.error('Nenhum contacto selecionado tem autorização atual para marketing por WhatsApp.');
    sessionStorage.setItem('broadcast:selected-contact-ids', JSON.stringify(eligible));
    router.push('/broadcasts/new?source=leads');
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-primary text-xs font-semibold uppercase tracking-[.14em]">Relacionamento e crescimento</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Leads</h1><p className="text-muted-foreground mt-1 text-sm">Uma fila de trabalho para reativar clientes e aproveitar oportunidades.</p></div><Button onClick={beginBroadcast} disabled={!selected.size}><Megaphone /> Criar disparo{selected.size ? ` (${selected.size})` : ''}</Button></div>
    <div className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-5">
      <LeadMetric icon={Users} label="Contactos" value={rows.length} onClick={() => setFilter('all')} active={filter === 'all'} />
      <LeadMetric icon={VenusAndMars} label="Masculino" value={counts.male} onClick={() => setFilter('male')} active={filter === 'male'} />
      <LeadMetric icon={VenusAndMars} label="Feminino" value={counts.female} onClick={() => setFilter('female')} active={filter === 'female'} />
      <LeadMetric icon={Gift} label="A vencer em 30 dias" value={counts.expiring} onClick={() => setFilter('expiring')} active={filter === 'expiring'} />
      <LeadMetric icon={Megaphone} label="Prontos para marketing" value={counts.ready} onClick={() => setFilter('marketing_ready')} active={filter === 'marketing_ready'} />
    </div>
    <Card><CardHeader className="gap-3"><div><CardTitle>Lista de trabalho</CardTitle><CardDescription>O disparo só inclui contactos com consentimento de marketing WhatsApp atual.</CardDescription></div><div className="flex flex-wrap gap-2"><Button size="sm" variant={filter === 'no_appointment' ? 'default' : 'outline'} onClick={() => setFilter('no_appointment')}>Sem marcação futura ({counts.noAppointment})</Button><Button size="sm" variant="outline" onClick={() => { setFilter('all'); setQuery(''); }}>Limpar filtros</Button></div><div className="relative max-w-xl"><Search className="text-muted-foreground absolute left-3 top-3 size-4" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome, telefone, email ou empresa" /></div></CardHeader><CardContent>{loading ? <div className="flex h-52 items-center justify-center"><Loader2 className="animate-spin" /></div> : <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="w-10 p-3"><Checkbox checked={allVisible} onCheckedChange={(value) => toggleAll(Boolean(value))} /></th><th className="p-3">Contacto</th><th className="p-3">Segmento</th><th className="p-3">Benefícios</th><th className="p-3">Próxima ação</th><th className="p-3">Marketing</th></tr></thead><tbody>{visible.map((row) => <tr key={row.contact.id} className="border-t"><td className="p-3"><Checkbox checked={selected.has(row.contact.id)} onCheckedChange={(value) => setSelected((current) => { const next = new Set(current); value ? next.add(row.contact.id) : next.delete(row.contact.id); return next; })} /></td><td className="p-3"><button className="text-left font-medium hover:underline" onClick={() => router.push(`/contacts/${row.contact.id}`)}>{row.contact.name || 'Sem nome'}</button><p className="text-muted-foreground text-xs">{row.contact.phone || row.contact.email || 'Sem contacto'}</p></td><td className="p-3"><Badge variant="outline">{row.contact.gender === 'male' ? 'Masculino' : row.contact.gender === 'female' ? 'Feminino' : 'Não informado'}</Badge></td><td className="p-3">{row.expiring !== undefined ? <Badge className="bg-amber-100 text-amber-900">Vence em {row.expiring} dia(s)</Badge> : row.benefits ? <span>{row.benefits} ativo(s)</span> : <span className="text-muted-foreground">Sem benefícios</span>}</td><td className="p-3">{row.hasUpcoming ? <span className="text-emerald-700">Marcação prevista</span> : <span className="text-amber-700">Reativar / agendar</span>}</td><td className="p-3">{row.ready ? <span className="text-emerald-700">Autorizado</span> : <span className="text-muted-foreground">Sem autorização</span>}</td></tr>)}{!visible.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhum contacto corresponde a este filtro.</td></tr>}</tbody></table></div>}</CardContent></Card>
  </div>;
}

function LeadMetric({ icon: Icon, label, value, onClick, active }: { icon: typeof Users; label: string; value: number; onClick: () => void; active: boolean }) { return <button onClick={onClick} className={`border-b p-4 text-left transition-colors sm:border-r xl:border-b-0 ${active ? 'bg-primary/5' : 'hover:bg-muted/50'}`}><div className="flex items-center justify-between gap-3"><p className="text-muted-foreground text-xs font-medium">{label}</p><Icon className="text-primary size-4" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></button>; }

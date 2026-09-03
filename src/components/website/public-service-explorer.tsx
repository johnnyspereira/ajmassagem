'use client';

import { useState } from 'react';
import { ArrowRight, Check, Clock3, Info, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type PublicService = {
  id: string; name: string; description?: string | null; public_presentation?: string | null;
  public_benefits?: string[] | null; public_considerations?: string[] | null; public_image_url?: string | null;
  duration_minutes: number; price: number; currency: string; color: string;
};

export function PublicServiceExplorer({ services, bookingUrl }: { services: PublicService[]; bookingUrl: string }) {
  const [selected, setSelected] = useState<PublicService | null>(null);
  return <>
    <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => <button type="button" key={service.id} onClick={() => setSelected(service)} className="site-card site-service-card group overflow-hidden rounded-2xl border border-slate-200 text-left transition hover:-translate-y-1 hover:shadow-xl">
        {service.public_image_url && <img src={service.public_image_url} alt={service.name} className="h-44 w-full object-cover transition duration-500 group-hover:scale-105" />}
        <div className="p-6"><p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand)] uppercase">Experiência personalizada</p><h3 className="mt-2 text-xl font-semibold">{service.name}</h3><p className="mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-500">{service.description || service.public_presentation || 'Conheça esta modalidade e descubra como a sessão pode ser adaptada às suas necessidades.'}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm"><span className="flex items-center gap-1 text-slate-500"><Clock3 className="size-4" />{service.duration_minutes} min</span><span className="font-semibold text-[var(--brand)]">{Number(service.price) > 0 ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: service.currency || 'EUR' }).format(Number(service.price)) : 'Sob consulta'}</span></div><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">Ver detalhes <ArrowRight className="size-4" /></span></div>
      </button>)}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      {selected && <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl"><div className="grid sm:grid-cols-[.9fr_1.1fr]">{selected.public_image_url ? <img src={selected.public_image_url} alt={selected.name} className="h-56 w-full object-cover sm:h-full" /> : <div className="hidden bg-gradient-to-br from-violet-100 via-white to-emerald-100 sm:flex sm:min-h-96 sm:items-center sm:justify-center"><Sparkles className="size-14 text-[var(--brand)]" /></div>}<div className="p-6 sm:p-8"><DialogHeader><p className="text-sm font-semibold text-[var(--brand)]">{selected.duration_minutes} minutos · {Number(selected.price) > 0 ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: selected.currency || 'EUR' }).format(Number(selected.price)) : 'Valor sob consulta'}</p><DialogTitle className="text-3xl">{selected.name}</DialogTitle><DialogDescription className="text-base leading-7 text-slate-600">{selected.public_presentation || selected.description || 'Informação desta modalidade em atualização.'}</DialogDescription></DialogHeader><DetailList icon={Check} title="Benefícios" items={selected.public_benefits} tone="emerald" /><DetailList icon={TriangleAlert} title="Cuidados e contraindicações" items={selected.public_considerations} tone="amber" /><div className="mt-7 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><Info className="mr-2 inline size-4 text-[var(--brand)]" />A avaliação é individual. Adaptamos a sessão às suas necessidades e ao seu conforto.</div><Button className="mt-5 w-full" render={<a href={bookingUrl} />} >Marcar esta experiência <ArrowRight /></Button></div></div></DialogContent>}
    </Dialog>
  </>;
}

function DetailList({ icon: Icon, title, items, tone }: { icon: typeof Check; title: string; items?: string[] | null; tone: 'emerald' | 'amber' }) { const entries = items?.filter(Boolean) ?? []; if (!entries.length) return null; return <section className="mt-6"><h4 className="flex items-center gap-2 font-semibold"><span className={tone === 'emerald' ? 'rounded-lg bg-emerald-100 p-1.5 text-emerald-700' : 'rounded-lg bg-amber-100 p-1.5 text-amber-700'}><Icon className="size-4" /></span>{title}</h4><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">{entries.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />{item}</li>)}</ul></section>; }

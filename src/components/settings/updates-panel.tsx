'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, History, Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  RELEASE_NOTES,
  type UpdateCategory,
} from '@/lib/updates/release-notes';

const categories: Array<UpdateCategory | 'Todas'> = [
  'Todas',
  'Novidade',
  'Melhoria',
  'Correção',
  'Manutenção',
];
const tones: Record<UpdateCategory, string> = {
  Novidade: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  Melhoria: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Correção: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Manutenção: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};
function formatDate(date: string) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  });
}
export function UpdatesPanel() {
  const [search, setSearch] = useState('');
  const [category, setCategory] =
    useState<(typeof categories)[number]>('Todas');
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-PT');
  const notes = RELEASE_NOTES.filter(
    (note) =>
      (category === 'Todas' || note.category === category) &&
      normalize(
        [
          note.title,
          note.summary,
          ...note.areas,
          ...note.changes,
          note.howTo,
        ].join(' ')
      ).includes(normalize(search.trim()))
  );
  return (
    <section className="space-y-5">
      <header className="border-border bg-card rounded-2xl border p-5 sm:p-6">
        <span className="bg-primary/10 text-primary mb-3 inline-flex rounded-xl p-2.5">
          <History className="size-5" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">
          Atualizações do sistema
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          O que mudou no CRM, por que mudou e como utilizar cada novidade.
          Consulte aqui as melhorias e correções que acompanham cada
          atualização.
        </p>
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <span>{RELEASE_NOTES.length} notas de atualização</span>
          <span>Registo mais recente: {formatDate(RELEASE_NOTES[0].date)}</span>
        </div>
      </header>
      <div className="border-border bg-card rounded-2xl border p-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            aria-label="Pesquisar atualizações"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por funcionalidade ou alteração…"
            className="pl-9"
          />
        </div>
        <div
          className="mt-3 flex flex-wrap gap-2"
          aria-label="Tipo de atualização"
        >
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                category === value
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground text-xs"
      >
        {notes.length}{' '}
        {notes.length === 1
          ? 'atualização encontrada'
          : 'atualizações encontradas'}
      </p>
      <div className="space-y-4">
        {notes.map((note, index) => (
          <article
            key={note.id}
            id={note.id}
            className="border-border bg-card overflow-hidden rounded-2xl border"
          >
            <header className="border-border border-b p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-semibold',
                    tones[note.category]
                  )}
                >
                  {note.category}
                </span>
                <time
                  dateTime={note.date}
                  className="text-muted-foreground text-xs"
                >
                  {formatDate(note.date)}
                </time>
                {index === 0 && note.id === RELEASE_NOTES[0].id && (
                  <span className="text-primary inline-flex items-center gap-1 text-xs">
                    <Sparkles className="size-3" />
                    Mais recente
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold sm:text-lg">
                {note.title}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {note.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {note.areas.map((area) => (
                  <span
                    key={area}
                    className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[11px]"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </header>
            <div className="p-5">
              <h4 className="mb-3 text-sm font-semibold">O que foi feito</h4>
              <ul className="text-muted-foreground marker:text-primary list-disc space-y-2 pl-4 text-sm leading-6">
                {note.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <div className="bg-muted/50 mt-5 rounded-xl p-4">
                <h4 className="text-sm font-semibold">Como utilizar</h4>
                <p className="text-muted-foreground mt-1.5 text-sm leading-6">
                  {note.howTo}
                </p>
                {note.link && (
                  <Link
                    href={note.link.href}
                    className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    {note.link.label}
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}
        {!notes.length && (
          <div className="border-border rounded-2xl border border-dashed p-10 text-center">
            <History className="text-muted-foreground mx-auto mb-3 size-7" />
            <p className="text-sm font-semibold">
              Nenhuma atualização encontrada
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Experimente outro termo ou selecione Todas.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('Todas');
              }}
              className="text-primary mt-4 text-sm font-semibold"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

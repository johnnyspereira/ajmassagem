'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { navigationGroups, groupLinks } from './navigation-model';
export function NavigationSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const match = (label: string) =>
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(
        query
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        aria-label="Procurar uma área (Ctrl+K)"
        className="text-muted-foreground hover:bg-muted flex h-10 items-center gap-2 rounded-xl px-3"
      >
        <Search className="size-4" />
        <span className="hidden text-xs xl:block">Ir para…</span>
        <kbd className="border-border hidden rounded border px-1 text-[10px] xl:block">
          Ctrl K
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Para onde vamos?</DialogTitle>
            <DialogDescription>
              Encontre uma ferramenta ou área do seu espaço de trabalho.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Procurar ferramentas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Agenda, clientes, vendas…"
          />
          <div className="max-h-[55vh] overflow-y-auto">
            {navigationGroups.map((group) => {
              const links = groupLinks(group.id).filter((item) =>
                match(item.label)
              );
              return links.length ? (
                <section key={group.id} className="mb-4">
                  <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wider uppercase">
                    {group.label}
                  </p>
                  {links.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="hover:bg-muted flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm"
                    >
                      <item.icon className="text-primary size-4" />
                      {item.label}
                      <ArrowUpRight className="text-muted-foreground ml-auto size-3.5" />
                    </Link>
                  ))}
                </section>
              ) : null;
            })}
            {!navigationGroups.some((group) =>
              groupLinks(group.id).some((item) => match(item.label))
            ) && (
              <p className="text-muted-foreground p-6 text-center text-sm">
                Nenhuma área encontrada.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

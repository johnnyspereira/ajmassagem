'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Copy, Link2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LINK_PREVIEWS } from '@/lib/sharing/previews';

const customer = (path: string) =>
  [
    '/',
    '/site',
    '/portal',
    '/servicos',
    '/profissionais',
    '/testemunhos',
    '/privacidade',
    '/privacy',
    '/anamnese',
    '/voucher',
    '/refer/',
    '/avaliar',
  ].some((prefix) => (prefix === '/' ? path === '/' : path.startsWith(prefix)));
export function LinkPreviewsPanel() {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('customer');
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-PT');
  const previews = LINK_PREVIEWS.filter(
    (item) =>
      (scope === 'all' || (scope === 'customer') === customer(item.path)) &&
      normalize(item.path + ' ' + item.title + ' ' + item.description).includes(
        normalize(search.trim())
      )
  );
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado.');
    } catch {
      toast.error(
        'Não foi possível copiar. Selecione o texto e copie manualmente.'
      );
    }
  }
  return (
    <section className="space-y-5">
      <header className="border-border bg-card rounded-2xl border p-5">
        <span className="bg-primary/10 text-primary inline-flex rounded-xl p-2.5">
          <Link2 className="size-5" />
        </span>
        <h2 className="mt-3 text-xl font-semibold">Partilha de links</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Textos preparados para a pré-visualização dos links da JP Massagem no
          WhatsApp e nas redes sociais. Os nomes, descrições e imagens de
          serviços e profissionais são preenchidos com os respetivos conteúdos
          públicos.
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          Links com [campos] são modelos: substitua-os pelo endereço real. Links
          reservados continuam a pedir autenticação. Secções com # usam a
          pré-visualização da página principal.
        </p>
      </header>
      <div className="border-border bg-card rounded-2xl border p-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            aria-label="Pesquisar textos de partilha"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar página, link ou texto…"
            className="pl-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['customer', 'Site e clientes'],
            ['team', 'Equipa e acesso'],
            ['all', 'Todos'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium',
                scope === value
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p role="status" className="text-muted-foreground text-xs">
        {previews.length} modelos de pré-visualização
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {previews.map((item) => {
          const title = item.title.includes('JP Massagem')
            ? item.title
            : item.title + ' | JP Massagem';
          return (
            <article
              key={item.path}
              className="border-border bg-card overflow-hidden rounded-2xl border"
            >
              <Image
                src="/social/jp-massagem-share-v1.png"
                alt="Imagem de partilha JP Massagem"
                width={1200}
                height={630}
                unoptimized
                className="aspect-[1200/630] w-full object-cover"
              />
              <div className="p-4">
                <p className="text-muted-foreground text-xs break-all">
                  jpmassagem.pt{item.path}
                </p>
                <h3 className="mt-2 text-base font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {item.description}
                </p>
                {item.path.includes('[') && (
                  <p className="text-primary mt-3 text-xs">
                    Modelo de link · os campos entre parênteses retos variam.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copy(title + '\n' + item.description)}
                  >
                    <Copy className="size-3.5" />
                    Copiar textos
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void copy('https://jpmassagem.pt' + item.path)
                    }
                  >
                    <Link2 className="size-3.5" />
                    {item.path.includes('[') ? 'Copiar modelo' : 'Copiar link'}
                  </Button>
                  {!item.path.includes('[') && (
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 px-2 text-xs font-semibold"
                    >
                      Abrir
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!previews.length && (
        <p className="text-muted-foreground border-border rounded-xl border border-dashed p-8 text-center text-sm">
          Nenhuma página encontrada. Experimente outro termo.
        </p>
      )}
    </section>
  );
}

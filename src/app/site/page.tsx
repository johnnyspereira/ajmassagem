import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Globe2, Search } from 'lucide-react';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = {
  title: 'Empresas',
  description: 'Encontre empresas e conheça os seus serviços.',
};

type PublishedSite = {
  slug: string;
  hero_title: string;
  hero_subtitle: string | null;
  primary_color: string;
  hero_image_url: string | null;
  account: { name: string; logo_url: string | null } | null;
};

export default async function PublicSitesDirectory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? '';
  const admin = supabaseAdmin();
  let request = admin
    .from('public_site_settings')
    .select(
      'slug,hero_title,hero_subtitle,primary_color,hero_image_url,account:accounts(name,logo_url)'
    )
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (query) {
    request = request.or(
      `hero_title.ilike.%${query.replace(/[,%()]/g, '')}%,slug.ilike.%${query.replace(/[,%()]/g, '')}%`
    );
  }

  const { data } = await request;
  const sites = (data ?? []) as unknown as PublishedSite[];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Globe2 className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Diretório de empresas</p>
            <p className="text-xs text-slate-500">
              Encontre serviços e profissionais
            </p>
          </div>
          <Link
            href="/login"
            className="ml-auto rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium"
          >
            Acesso empresarial
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-blue-600">
            EMPRESAS E PROFISSIONAIS
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Encontre a empresa que procura
          </h1>
          <p className="mt-4 leading-7 text-slate-500">
            Conheça serviços, planos, profissionais e formas de contacto das
            empresas publicadas.
          </p>
          <form className="relative mx-auto mt-8 max-w-xl">
            <Search className="absolute top-3.5 left-4 size-5 text-slate-400" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Pesquisar pelo nome ou endereço..."
              className="h-12 rounded-xl bg-white pr-24 pl-12 shadow-sm"
            />
            <button className="absolute top-1.5 right-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Pesquisar
            </button>
          </form>
        </div>

        {sites.length ? (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <Link
                key={site.slug}
                href={`/site/${site.slug}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-xl"
              >
                {site.hero_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={site.hero_image_url}
                    alt=""
                    className="aspect-[16/8] w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex aspect-[16/8] items-center justify-center"
                    style={{ backgroundColor: `${site.primary_color}18` }}
                  >
                    {site.account?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={site.account.logo_url}
                        alt=""
                        className="size-20 object-contain"
                      />
                    ) : (
                      <Building2
                        className="size-12"
                        style={{ color: site.primary_color }}
                      />
                    )}
                  </div>
                )}
                <div className="p-5">
                  <p className="text-xs font-medium text-slate-500">
                    {site.account?.name ?? site.slug}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold group-hover:text-blue-600">
                    {site.hero_title}
                  </h2>
                  {site.hero_subtitle && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                      {site.hero_subtitle}
                    </p>
                  )}
                  <span
                    className="mt-5 inline-block text-sm font-semibold"
                    style={{ color: site.primary_color }}
                  >
                    Conhecer empresa →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mx-auto mt-14 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Building2 className="mx-auto size-11 text-slate-300" />
            <h2 className="mt-4 font-semibold">
              {query
                ? 'Nenhuma empresa encontrada'
                : 'Ainda não existem sites publicados'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {query
                ? 'Tente pesquisar por outro nome.'
                : 'As empresas aparecerão aqui depois de publicarem os seus sites.'}
            </p>
            {query && (
              <Link
                href="/site"
                className="mt-5 inline-block text-sm font-semibold text-blue-600"
              >
                Limpar pesquisa
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

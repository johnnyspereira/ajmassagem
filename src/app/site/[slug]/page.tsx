/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Clock3,
  Camera,
  Users,
  Briefcase,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Quote,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { getPublicBusinessSite } from '@/lib/public-site/server';
import { PublicLeadForm } from '@/components/website/public-lead-form';
import { PublicHeroSlider } from '@/components/website/public-hero-slider';
import './site-themes.css';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicBusinessSite(slug);
  if (!site)
    return {
      title: 'Site indisponível',
      robots: { index: false, follow: false },
    };
  return {
    title: site.settings.seo_title || site.account.name,
    description:
      site.settings.seo_description ||
      site.settings.hero_subtitle ||
      site.settings.about_text ||
      undefined,
    openGraph: {
      title: site.settings.seo_title || site.account.name,
      description:
        site.settings.seo_description ||
        site.settings.hero_subtitle ||
        undefined,
      images: site.settings.hero_image_url
        ? [site.settings.hero_image_url]
        : site.account.logo_url
          ? [site.account.logo_url]
          : undefined,
    },
  };
}
export default async function PublicBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    site = await getPublicBusinessSite(slug);
  if (!site) notFound();
  const { settings, account, services, team, portal } = site;
  const bookingUrl = portal?.booking_enabled
    ? `/portal/${portal.slug}`
    : '#contacto';
  const whatsapp = settings.whatsapp_phone?.replace(/\D/g, '');
  const heroSlides = [
    ...(settings.hero_image_url
      ? [{ image: settings.hero_image_url, label: 'Destaque' }]
      : []),
    { image: '/site-presets/wellness/hero-01.webp', label: 'Experiência' },
    { image: '/site-presets/wellness/hero-02.webp', label: 'Bem-estar' },
    { image: '/site-presets/wellness/hero-03.webp', label: 'Ambiente' },
  ].slice(0, 3);
  return (
    <div
      className="public-site min-h-screen bg-white text-slate-900"
      data-site-theme={settings.site_theme || 'wellness'}
      style={
        {
          '--brand': settings.primary_color,
          '--dark': settings.accent_color,
        } as React.CSSProperties
      }
    >
      <header className="site-header sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href={`/site/${slug}`} className="flex items-center gap-3">
            {account.logo_url ? (
              <img
                src={account.logo_url}
                alt=""
                className="size-10 rounded-xl object-contain"
              />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] font-bold text-white">
                {account.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="font-semibold">{account.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#servicos">Serviços</a>
            <a href="#sobre">Sobre</a>
            {settings.show_plans && <a href="#planos">Planos</a>}
            <a href="#contacto">Contacto</a>
          </nav>
          <div className="flex gap-2">
            {portal && (
              <Link
                href={`/portal/${portal.slug}`}
                className="site-button site-button-secondary hidden rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium sm:block"
              >
                Área do cliente
              </Link>
            )}
            <Link
              href={bookingUrl}
              className="site-button rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            >
              Agendar
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className="site-hero relative overflow-hidden bg-[var(--dark)] text-white">
          <PublicHeroSlider slides={heroSlides} />
          <div className="site-hero-inner relative z-[2] mx-auto flex min-h-[720px] max-w-7xl items-center px-4 py-28 sm:px-6">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium">
                <Sparkles className="size-3.5" />
                {settings.hero_badge || 'Bem-vindo'}
              </span>
              <h1 className="site-hero-title mt-6 max-w-3xl text-4xl leading-tight font-semibold sm:text-5xl lg:text-6xl">
                {settings.hero_title}
              </h1>
              {settings.hero_subtitle && (
                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
                  {settings.hero_subtitle}
                </p>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={bookingUrl}
                  className="site-button inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 font-semibold"
                >
                  Marcar agora
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#sobre"
                  className="site-button site-button-ghost rounded-xl border border-white/20 px-6 py-3 font-semibold"
                >
                  Conhecer a empresa
                </a>
              </div>
              <div className="mt-10 flex flex-wrap gap-5 text-sm text-white/70">
                {settings.contact_phone && (
                  <span className="flex items-center gap-2">
                    <Phone className="size-4" />
                    {settings.contact_phone}
                  </span>
                )}
                {settings.opening_hours && (
                  <span className="flex items-center gap-2">
                    <Clock3 className="size-4" />
                    {settings.opening_hours}
                  </span>
                )}
              </div>
              <div className="mt-10 grid max-w-xl grid-cols-3 border-t border-white/20 pt-6">
                <div>
                  <strong className="block text-xl">Atendimento</strong>
                  <span className="text-xs text-white/60">personalizado</span>
                </div>
                <div className="border-l border-white/20 pl-5">
                  <strong className="block text-xl">Qualidade</strong>
                  <span className="text-xs text-white/60">em cada detalhe</span>
                </div>
                <div className="border-l border-white/20 pl-5">
                  <strong className="block text-xl">Confiança</strong>
                  <span className="text-xs text-white/60">
                    do início ao fim
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {settings.show_services && services.length > 0 && (
          <section
            id="servicos"
            className="mx-auto max-w-7xl px-4 py-24 sm:px-6"
          >
            <SectionHeading
              eyebrow="O QUE FAZEMOS"
              title="Serviços pensados para você"
              description="Conheça as opções disponíveis e escolha a experiência ideal."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <article
                  key={service.id}
                  className="site-card site-service-card group rounded-2xl border border-slate-200 p-6 transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--brand)_12%,white)] text-[var(--brand)]">
                    <Sparkles />
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{service.name}</h3>
                  {service.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                      {service.description}
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
                    <span className="text-slate-500">
                      {service.duration_minutes} minutos
                    </span>
                    <span className="font-semibold text-[var(--brand)]">
                      {Number(service.price) > 0
                        ? new Intl.NumberFormat('pt-PT', {
                            style: 'currency',
                            currency:
                              service.currency || account.default_currency,
                          }).format(Number(service.price))
                        : 'Sob consulta'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <section id="sobre" className="site-about bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold text-[var(--brand)]">
                QUEM SOMOS
              </p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                {settings.about_title}
              </h2>
            </div>
            <div className="space-y-8">
              {settings.about_text && (
                <p className="text-lg leading-8 text-slate-600">
                  {settings.about_text}
                </p>
              )}
              {settings.history_text && (
                <InfoBlock
                  title="Nossa história"
                  text={settings.history_text}
                />
              )}{' '}
              {settings.mission_text && (
                <InfoBlock
                  title="Missão e valores"
                  text={settings.mission_text}
                />
              )}
            </div>
          </div>
        </section>
        <section className="site-experience overflow-hidden py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_0.8fr]">
              <SectionHeading
                eyebrow="A NOSSA EXPERIÊNCIA"
                title="Um cuidado presente em todos os detalhes"
                description="Do primeiro contacto ao acompanhamento final, cada momento é preparado para transmitir conforto, segurança e excelência."
              />
              <p className="max-w-xl text-sm leading-7 text-slate-500 lg:justify-self-end">
                Ambiente, atendimento e técnica reunidos numa experiência que
                respeita o seu tempo e as suas necessidades.
              </p>
            </div>
            <div className="site-gallery mt-12 grid min-h-[520px] gap-4 md:grid-cols-[1.35fr_0.65fr] md:grid-rows-2">
              {heroSlides.map((slide, index) => (
                <figure
                  key={slide.image}
                  className={`group relative min-h-64 overflow-hidden ${index === 0 ? 'md:row-span-2' : ''}`}
                >
                  <img
                    src={slide.image}
                    alt={`${slide.label} — ${account.name}`}
                    className="size-full object-cover transition duration-700 group-hover:scale-[1.025]"
                  />
                  <figcaption className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent p-6 pt-16 text-sm font-semibold tracking-wide text-white uppercase">
                    {slide.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
        {settings.show_benefits && settings.benefits.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <SectionHeading
              eyebrow="POR QUE ESCOLHER-NOS"
              title="Benefícios que fazem diferença"
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {settings.benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="site-card rounded-2xl bg-slate-50 p-6"
                >
                  <Check className="size-6 text-[var(--brand)]" />
                  <h3 className="mt-4 font-semibold">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {settings.show_team && team.length > 0 && (
          <section className="site-team bg-[var(--dark)] text-white">
            <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
              <SectionHeading
                eyebrow="NOSSA EQUIPA"
                title="Profissionais em quem confiar"
                dark
              />
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {team.map((person) => (
                  <article
                    key={person.id}
                    className="site-card site-team-card rounded-2xl border border-white/10 bg-white/5 p-5"
                  >
                    {person.avatar_url ? (
                      <img
                        src={person.avatar_url}
                        alt=""
                        className="aspect-square w-full rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center rounded-xl bg-white/10">
                        <UsersRound className="size-12 text-white/40" />
                      </span>
                    )}
                    <h3 className="mt-4 font-semibold">{person.full_name}</h3>
                    <p className="mt-1 text-sm text-[var(--brand)]">
                      {person.professional_title || 'Profissional'}
                    </p>
                    {person.professional_bio && (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/60">
                        {person.professional_bio}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
        {settings.show_plans && settings.plans.length > 0 && (
          <section id="planos" className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <SectionHeading eyebrow="PLANOS" title="Escolha a melhor opção" />
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {settings.plans.map((plan, index) => (
                <article
                  key={index}
                  className={`site-card site-plan relative rounded-2xl border p-7 ${plan.highlighted ? 'border-[var(--brand)] shadow-xl' : 'border-slate-200'}`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-6 rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-semibold text-white">
                      Mais escolhido
                    </span>
                  )}
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  <p className="mt-3 text-3xl font-semibold text-[var(--brand)]">
                    {plan.price}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {plan.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm">
                        <Check className="size-4 shrink-0 text-[var(--brand)]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#contacto"
                    className="site-button mt-7 block rounded-xl bg-[var(--dark)] px-5 py-3 text-center text-sm font-semibold text-white"
                  >
                    Tenho interesse
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
        {settings.show_testimonials && settings.testimonials.length > 0 && (
          <section className="site-testimonials bg-slate-50">
            <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
              <SectionHeading
                eyebrow="DEPOIMENTOS"
                title="O que dizem sobre nós"
              />
              <div className="mt-12 grid gap-5 lg:grid-cols-3">
                {settings.testimonials.map((item, index) => (
                  <blockquote
                    key={index}
                    className="site-card rounded-2xl bg-white p-7 shadow-sm"
                  >
                    <Quote className="text-[var(--brand)]" />
                    <p className="mt-5 leading-7 text-slate-600">
                      “{item.quote}”
                    </p>
                    <footer className="mt-6">
                      <b>{item.name}</b>
                      <p className="text-sm text-slate-500">{item.role}</p>
                    </footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </section>
        )}
        {settings.show_faq && settings.faqs.length > 0 && (
          <section className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
            <SectionHeading eyebrow="DÚVIDAS" title="Perguntas frequentes" />
            <div className="site-card mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 px-6">
              {settings.faqs.map((faq, index) => (
                <details key={index} className="group py-5">
                  <summary className="cursor-pointer list-none font-semibold">
                    {faq.question}
                  </summary>
                  <p className="mt-3 leading-7 text-slate-500">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        <section id="contacto" className="site-contact bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-[var(--brand)]">
                FALE CONNOSCO
              </p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Vamos conversar?
              </h2>
              <p className="mt-4 max-w-lg leading-7 text-slate-500">
                Envie uma mensagem. A nossa equipa receberá o seu pedido
                diretamente no sistema.
              </p>
              <div className="mt-8 space-y-4 text-sm">
                {settings.contact_phone && (
                  <ContactLine icon={Phone} text={settings.contact_phone} />
                )}{' '}
                {settings.contact_email && (
                  <ContactLine icon={Mail} text={settings.contact_email} />
                )}{' '}
                {settings.address && (
                  <ContactLine icon={MapPin} text={settings.address} />
                )}{' '}
                {settings.opening_hours && (
                  <ContactLine icon={Clock3} text={settings.opening_hours} />
                )}
              </div>
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="site-button mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
                >
                  <MessageCircle />
                  Falar pelo WhatsApp
                </a>
              )}
            </div>
            <PublicLeadForm slug={slug} primaryColor={settings.primary_color} />
          </div>
        </section>
      </main>
      <footer className="site-footer bg-[var(--dark)] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">{account.name}</p>
            <p className="mt-1 text-xs text-white/50">
              © {new Date().getFullYear()} Todos os direitos reservados.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {settings.instagram_url && (
              <SocialLink href={settings.instagram_url} icon={Camera} />
            )}{' '}
            {settings.facebook_url && (
              <SocialLink href={settings.facebook_url} icon={Users} />
            )}{' '}
            {settings.linkedin_url && (
              <SocialLink href={settings.linkedin_url} icon={Briefcase} />
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-[var(--brand)]">{eyebrow}</p>
      <h2
        className={`mt-3 text-3xl font-semibold sm:text-4xl ${dark ? 'text-white' : ''}`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mt-4 leading-7 ${dark ? 'text-white/60' : 'text-slate-500'}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 leading-7 whitespace-pre-wrap text-slate-500">
        {text}
      </p>
    </div>
  );
}
function ContactLine({
  icon: Icon,
  text,
}: {
  icon: typeof Phone;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-white text-[var(--brand)]">
        <Icon className="size-4" />
      </span>
      <span>{text}</span>
    </div>
  );
}
function SocialLink({
  href,
  icon: Icon,
}: {
  href: string;
  icon: typeof Camera;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex size-9 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white"
    >
      <Icon className="size-4" />
    </a>
  );
}

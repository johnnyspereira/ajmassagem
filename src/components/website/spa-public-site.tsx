/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  Menu,
  Phone,
  Sparkles,
  Star,
} from 'lucide-react';

import { PublicLeadForm } from '@/components/website/public-lead-form';
import { formatCurrency } from '@/lib/currency';
import { serviceSlug } from '@/lib/public-site/service-slug';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './spa-public-site.module.css';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;

const fallbackImage = '/site-assets/jp-massagem-hero-v1.png';

export function SpaPublicSite({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const bookingHref =
    settings.show_booking && portal?.booking_enabled ? '/portal?book=1' : '#contacto';
  const visibleServices = services.filter((service) => !service.coming_soon);
  const colors = {
    '--spa-brand': settings.primary_color || '#9b7650',
    '--spa-ink': settings.accent_color || '#1e2b22',
  } as React.CSSProperties;

  return (
    <div className={styles.site} style={colors}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label={account.name}>
          {account.logo_url ? <img src={account.logo_url} alt="" /> : <span>JP</span>}
          <strong>{account.name}</strong>
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="#servicos">Serviços</a>
          <a href="#sobre">A experiência</a>
          {settings.show_team && team.length > 0 && <a href="#equipa">Equipa</a>}
          <a href="#contacto">Contacto</a>
        </nav>
        <div className={styles.headerActions}>
          <Link href="/portal" className={styles.portalLink}>Área do cliente</Link>
          <Link href={bookingHref} className={styles.headerButton}>Agendar <ArrowRight /></Link>
          <Menu className={styles.menu} />
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <img className={styles.heroImage} src={settings.hero_image_url || fallbackImage} alt="Ambiente de bem-estar" />
          <div className={styles.heroShade} />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}><Sparkles /> {settings.hero_badge || 'Bem-estar personalizado'}</p>
            <h1>{settings.hero_title}</h1>
            <p className={styles.heroText}>{settings.hero_subtitle}</p>
            <div className={styles.heroActions}>
              <Link href={bookingHref} className={styles.primaryButton}>Marcar sessão <CalendarDays /></Link>
              <a href="#servicos" className={styles.secondaryButton}>Explorar serviços</a>
            </div>
          </div>
          <div className={styles.heroFooter}>
            <span>Experiências de cuidado</span><span>·</span><span>Atendimento por marcação</span>
          </div>
        </section>

        <section className={styles.intro}>
          <p className={styles.eyebrow}>O seu tempo, bem cuidado</p>
          <h2>{settings.about_title || 'Um momento para voltar a si.'}</h2>
          <p>{settings.about_text || 'Cada sessão é preparada para o seu corpo, o seu ritmo e aquilo de que precisa hoje.'}</p>
        </section>

        {settings.show_services && visibleServices.length > 0 && (
          <section id="servicos" className={styles.services}>
            <div className={styles.sectionHead}>
              <div><p className={styles.eyebrow}>Os nossos rituais</p><h2>Escolha o seu momento.</h2></div>
              <Link href={bookingHref} className={styles.textLink}>Ver disponibilidade <ArrowRight /></Link>
            </div>
            <div className={styles.serviceGrid}>
              {visibleServices.slice(0, 6).map((service, index) => (
                <article key={service.id} className={styles.serviceCard}>
                  <div className={styles.serviceImage}>
                    {service.public_image_url ? <img src={service.public_image_url} alt={service.name} /> : <img src={settings.hero_image_url || fallbackImage} alt="" />}
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <div className={styles.serviceBody}>
                    <div><h3>{service.name}</h3><p>{service.public_presentation || service.description || 'Uma experiência pensada para o seu bem-estar.'}</p></div>
                    <div className={styles.serviceMeta}><span><Clock3 /> {service.duration_minutes} min</span><strong>{Number(service.price) > 0 ? formatCurrency(Number(service.price), service.currency || account.default_currency) : 'Sob consulta'}</strong></div>
                    <Link href={`/servicos/${serviceSlug(service.name)}`} className={styles.cardLink}>Conhecer <ArrowRight /></Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="sobre" className={styles.story}>
          <div className={styles.storyImage}><img src={settings.hero_image_url || fallbackImage} alt="Detalhe do espaço" /></div>
          <div className={styles.storyCopy}>
            <p className={styles.eyebrow}>Mais do que uma sessão</p>
            <h2>{settings.history_text || 'Um espaço calmo para cuidar de si.'}</h2>
            <p>{settings.mission_text || settings.about_text || 'Acreditamos que bem-estar começa quando existe tempo, escuta e um cuidado feito à medida.'}</p>
            <Link href={bookingHref} className={styles.textLink}>Encontrar o seu horário <ArrowRight /></Link>
          </div>
        </section>

        {settings.show_team && team.length > 0 && (
          <section id="equipa" className={styles.team}>
            <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Em boas mãos</p><h2>Quem cuida de si.</h2></div></div>
            <div className={styles.teamGrid}>
              {team.slice(0, 4).map((person) => (
                <article key={person.id} className={styles.person}>
                  <div className={styles.personImage}>{person.avatar_url ? <img src={person.avatar_url} alt={person.full_name || ''} /> : <span>{person.full_name?.slice(0, 1) || '•'}</span>}</div>
                  <h3>{person.full_name}</h3><p>{person.professional_title || 'Profissional de bem-estar'}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {settings.show_plans && settings.plans.length > 0 && (
          <section className={styles.plans}>
            <p className={styles.eyebrow}>Experiências para repetir</p><h2>Planos que acompanham o seu ritmo.</h2>
            <div className={styles.planGrid}>{settings.plans.map((plan, index) => <article key={`${plan.name}-${index}`} className={plan.highlighted ? styles.planFeatured : styles.plan}><p>{plan.name}</p><strong>{plan.price}</strong><span>{plan.description}</span><ul>{plan.features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul><Link href={bookingHref}>Quero saber mais <ArrowRight /></Link></article>)}</div>
          </section>
        )}

        {settings.show_benefits && settings.benefits.length > 0 && (
          <section className={styles.benefits}>{settings.benefits.map((benefit, index) => <article key={`${benefit.title}-${index}`}><Star /><h3>{benefit.title}</h3><p>{benefit.description}</p></article>)}</section>
        )}

        {settings.show_testimonials && settings.testimonials.length > 0 && (
          <section className={styles.testimonials}><p className={styles.eyebrow}>Palavras de quem veio</p>{settings.testimonials.slice(0, 3).map((item, index) => <figure key={`${item.name}-${index}`} className={index === 0 ? undefined : styles.extraQuote}><blockquote>“{item.quote}”</blockquote><figcaption>{item.name}{item.role ? ` · ${item.role}` : ''}</figcaption></figure>)}</section>
        )}

        {settings.show_faq && settings.faqs.length > 0 && (
          <section className={styles.faq}><div><p className={styles.eyebrow}>Dúvidas frequentes</p><h2>Antes da sua visita.</h2></div><div>{settings.faqs.map((item, index) => <details key={`${item.question}-${index}`}><summary>{item.question}<ChevronDown /></summary><p>{item.answer}</p></details>)}</div></section>
        )}

        <section id="contacto" className={styles.contact}>
          <div className={styles.contactCopy}><p className={styles.eyebrow}>Vamos conversar</p><h2>O seu próximo momento começa aqui.</h2><p>Partilhe o que procura. A equipa ajuda a encontrar a experiência e o horário certos.</p><div className={styles.contactInfo}>{settings.contact_phone && <span><Phone /> {settings.contact_phone}</span>}{settings.address && <span><MapPin /> {settings.address}</span>}</div></div>
          <PublicLeadForm slug={settings.slug} primaryColor={settings.primary_color} />
        </section>
      </main>
      <footer className={styles.footer}><div className={styles.logo}>{account.logo_url ? <img src={account.logo_url} alt="" /> : <span>JP</span>}<strong>{account.name}</strong></div><span>© {new Date().getFullYear()} · Todos os direitos reservados.</span><Link href="/portal">Área do cliente</Link></footer>
    </div>
  );
}

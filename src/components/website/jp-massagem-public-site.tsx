/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  Menu,
  Phone,
  Quote,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { PublicLeadForm } from '@/components/website/public-lead-form';
import { serviceSlug } from '@/lib/public-site/service-slug';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './jp-massagem-public-site.module.css';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;
const fallbackHero = '/site-assets/jp-massagem-hero-v1.png';

export function JpMassagemPublicSite({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const bookingEnabled = settings.show_booking && Boolean(portal?.booking_enabled);
  const bookingHref = bookingEnabled ? '/portal?book=1' : '#contacto';
  const visibleServices = settings.show_services
    ? services.filter((service) => !service.coming_soon)
    : [];
  const hasServices = visibleServices.length > 0;
  const phoneHref = settings.contact_phone?.replace(/[^+\d]/g, '');
  const whatsappHref = settings.whatsapp_phone?.replace(/\D/g, '');
  const mapsHref = settings.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`
    : null;
  const formatPrice = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: account.default_currency || 'EUR',
    maximumFractionDigits: 0,
  });
  const testimonials = settings.show_testimonials ? settings.testimonials : [];
  const faqs = settings.show_faq ? settings.faqs : [];
  const hasAbout = Boolean(settings.about_text || settings.history_text || settings.mission_text);
  const navigation = [
    ...(hasServices ? [{ href: '#servicos', label: 'Serviços' }] : []),
    ...(hasAbout ? [{ href: '#sobre', label: 'Sobre' }] : []),
    ...(settings.show_team && team.length ? [{ href: '#equipa', label: 'Equipa' }] : []),
    { href: '#contacto', label: 'Contacto' },
  ];

  return (
    <div
      className={styles.site}
      data-site-theme={settings.site_theme}
      style={{
        '--brand': settings.primary_color || '#9d7144',
        '--accent': settings.accent_color || '#1c241f',
      } as React.CSSProperties}
    >
      <div className={styles.announcement}>
        <span><Sparkles aria-hidden="true" /> Um tempo para cuidar de si</span>
        {settings.address && <span className={styles.announcementLocation}><MapPin aria-hidden="true" /> {settings.address}</span>}
      </div>

      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label={`${account.name}, página inicial`}>
          {account.logo_url ? <img src={account.logo_url} alt="" /> : <span>JP</span>}
          <b>{account.name}</b>
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          {navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <details className={styles.mobileMenu}>
          <summary aria-label="Abrir navegação"><Menu aria-hidden="true" /></summary>
          <nav aria-label="Navegação móvel">
            {navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
            {portal && <Link href="/portal">Área do cliente</Link>}
          </nav>
        </details>
        <div className={styles.headerActions}>
          {portal && <Link href="/portal" className={styles.clientArea}>Área do cliente</Link>}
          <Link href={bookingHref} className={styles.headerCta}>
            {bookingEnabled ? 'Agendar sessão' : 'Falar connosco'} <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}><Sparkles aria-hidden="true" /> {settings.hero_badge || 'JP Massoterapia'}</p>
            <h1>{settings.hero_title || account.name}</h1>
            {settings.hero_subtitle && <p className={styles.heroText}>{settings.hero_subtitle}</p>}
            <div className={styles.heroButtons}>
              <Link href={bookingHref} className={styles.primaryButton}>
                {bookingEnabled ? 'Quero agendar' : 'Quero saber mais'} <CalendarDays aria-hidden="true" />
              </Link>
              {hasServices && <a href="#servicos" className={styles.textButton}>Explorar massagens <ArrowDownRight aria-hidden="true" /></a>}
            </div>
            {(settings.address || settings.opening_hours) && (
              <div className={styles.heroMeta}>
                {settings.address && <span><MapPin aria-hidden="true" /> {settings.address}</span>}
                {settings.opening_hours && <span><Clock3 aria-hidden="true" /> {settings.opening_hours}</span>}
              </div>
            )}
          </div>
          <div className={styles.heroVisual}>
            <img src={settings.hero_image_url || fallbackHero} alt="" fetchPriority="high" />
            <div className={styles.imageCaption}><span>JP</span><p>{settings.hero_badge || 'Bem-estar e massoterapia'}</p></div>
          </div>
        </section>

        {settings.show_benefits && settings.benefits.length > 0 && (
          <section className={styles.benefitStrip} aria-label="Informação sobre a experiência">
            {settings.benefits.slice(0, 3).map((benefit, index) => (
              <article key={`${benefit.title}-${index}`}>
                <span className={styles.benefitNumber}>0{index + 1}</span>
                <div><h2>{benefit.title}</h2><p>{benefit.description}</p></div>
              </article>
            ))}
          </section>
        )}

        {hasServices && (
          <section id="servicos" className={styles.services}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Encontre o seu momento</p><h2>Massagens pensadas para si.</h2></div>
              <p>Veja as opções disponíveis, conheça os detalhes e escolha como prefere dar o próximo passo.</p>
            </div>
            <div className={styles.serviceGrid}>
              {visibleServices.slice(0, 6).map((service, index) => (
                <article key={service.id} className={styles.serviceCard}>
                  <div className={styles.serviceImage}>
                    <img src={service.public_image_url || settings.hero_image_url || fallbackHero} alt="" loading="lazy" />
                    <span>{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <div className={styles.serviceBody}>
                    <p className={styles.serviceEyebrow}>Massagem</p>
                    <h3>{service.name}</h3>
                    {(service.public_presentation || service.description) && <p className={styles.serviceDescription}>{service.public_presentation || service.description}</p>}
                    <div className={styles.serviceMeta}>
                      <span><Clock3 aria-hidden="true" /> {service.duration_minutes} min</span>
                      <strong>{Number(service.price) > 0 ? formatPrice.format(Number(service.price)) : 'Sob consulta'}</strong>
                    </div>
                    <Link href={`/servicos/${serviceSlug(service.name)}`} className={styles.serviceLink}>Conhecer esta massagem <ArrowRight aria-hidden="true" /></Link>
                  </div>
                </article>
              ))}
            </div>
            {bookingEnabled && <div className={styles.servicesCta}><Link href={bookingHref} className={styles.primaryButton}>Ver horários disponíveis <CalendarDays aria-hidden="true" /></Link></div>}
          </section>
        )}

        {hasAbout && (
          <section id="sobre" className={styles.about}>
            <div className={styles.aboutImage}><img src={settings.hero_image_url || fallbackHero} alt="" loading="lazy" /></div>
            <div className={styles.aboutCopy}>
              <p className={styles.eyebrow}>Um espaço para si</p>
              <h2>{settings.about_title || account.name}</h2>
              {settings.about_text && <p>{settings.about_text}</p>}
              {settings.history_text && <p>{settings.history_text}</p>}
              {settings.mission_text && <p>{settings.mission_text}</p>}
              <Link href={bookingHref} className={styles.underlinedLink}>{bookingEnabled ? 'Agendar a minha sessão' : 'Entrar em contacto'} <ArrowUpRight aria-hidden="true" /></Link>
            </div>
          </section>
        )}

        {settings.show_team && team.length > 0 && (
          <section id="equipa" className={styles.team}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>A sua sessão, com pessoas reais</p><h2>Conheça a equipa.</h2></div><p>Veja quem presta os serviços e escolha com quem gostaria de falar.</p></div>
            <div className={styles.teamGrid}>
              {team.slice(0, 4).map((person) => (
                <Link key={person.id} href={`/profissionais/${encodeURIComponent(person.professional_public_slug || person.id)}`} className={styles.person}>
                  <div className={styles.personImage}>{person.avatar_url ? <img src={person.avatar_url} alt="" loading="lazy" /> : <UsersRound aria-hidden="true" />}</div>
                  <div><h3>{person.full_name}</h3>{person.professional_title && <p>{person.professional_title}</p>}</div><ArrowUpRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {testimonials.length > 0 && (
          <section id="testemunhos" className={styles.testimonials}>
            <div className={styles.testimonialHeading}><p className={styles.eyebrow}>Experiências partilhadas</p><h2>O que dizem os clientes.</h2><Quote aria-hidden="true" /></div>
            <div className={styles.testimonialGrid}>
              {testimonials.slice(0, 3).map((item, index) => (
                <figure key={`${item.name}-${index}`} className={styles.testimonialCard}>
                  <div className={styles.testimonialMark} aria-hidden="true"><Quote /></div>
                  <blockquote>“{item.quote}”</blockquote>
                  <figcaption>{item.name}{item.role ? ` · ${item.role}` : ''}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {faqs.length > 0 && (
          <section className={styles.faq}>
            <div><p className={styles.eyebrow}>Perguntas frequentes</p><h2>Ficou com alguma dúvida?</h2><p>Consulte as respostas partilhadas pela JP Massoterapia ou envie-nos uma mensagem.</p><Link href="#contacto" className={styles.textButton}>Fazer uma pergunta <ArrowRight aria-hidden="true" /></Link></div>
            <div className={styles.faqList}>{faqs.slice(0, 8).map((item, index) => <details key={`${item.question}-${index}`}><summary>{item.question}<ChevronDown aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div>
          </section>
        )}

        <section id="contacto" className={styles.contact}>
          <div className={styles.contactCopy}>
            <p className={styles.eyebrow}>O próximo passo é simples</p>
            <h2>Vamos encontrar o momento certo para si.</h2>
            <p>Envie-nos uma mensagem ou escolha uma sessão, se a marcação online estiver disponível.</p>
            <div className={styles.contactInfo}>
              {settings.contact_phone && <a href={`tel:${phoneHref}`}><Phone aria-hidden="true" /> {settings.contact_phone}</a>}
              {settings.whatsapp_phone && <a href={`https://wa.me/${whatsappHref}`} target="_blank" rel="noreferrer">WhatsApp <ArrowUpRight aria-hidden="true" /></a>}
              {settings.address && <span><MapPin aria-hidden="true" /> {settings.address}</span>}
              {settings.opening_hours && <span><Clock3 aria-hidden="true" /> {settings.opening_hours}</span>}
              {mapsHref && <a href={mapsHref} target="_blank" rel="noreferrer">Ver localização no Google Maps <ArrowUpRight aria-hidden="true" /></a>}
            </div>
            <Link href={bookingHref} className={styles.primaryButton}>{bookingEnabled ? 'Agendar sessão' : 'Enviar pedido de contacto'} <CalendarDays aria-hidden="true" /></Link>
          </div>
          <div className={styles.formWrap}><PublicLeadForm slug={settings.slug} primaryColor={settings.primary_color} /></div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/" className={styles.logo}>{account.logo_url ? <img src={account.logo_url} alt="" /> : <span>JP</span>}<b>{account.name}</b></Link>
        <nav aria-label="Ligações de rodapé"><a href="#servicos">Serviços</a><a href="#contacto">Contacto</a>{portal && <Link href="/portal">Área do cliente</Link>}<Link href="/privacidade">Privacidade</Link></nav>
        <span>© {new Date().getFullYear()} {account.name}</span>
      </footer>
      {bookingEnabled && <Link href={bookingHref} className={styles.mobileBooking}>Quero agendar <CalendarDays aria-hidden="true" /></Link>}
    </div>
  );
}

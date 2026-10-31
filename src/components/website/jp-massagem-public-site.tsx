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
  Phone,
  Quote,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { PublicLeadForm } from '@/components/website/public-lead-form';
import { onPublicColor, publicName } from '@/lib/public-site/journey';
import { PublicServiceCatalogue } from './public-service-catalogue';
import { PublicEnquiryLink } from './public-enquiry-link';
import { PublicMobileMenu } from './public-mobile-menu';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './jp-massagem-public-site.module.css';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;
const fallbackHero = '/site-assets/jp-massagem-hero-v1.png';

export function JpMassagemPublicSite({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const bookingEnabled =
    settings.show_booking && Boolean(portal?.booking_enabled);
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
  const plans = settings.show_plans ? settings.plans : [];
  const publishedReviews = site.reviews
    .filter(
      (review) => typeof review.comment === 'string' && review.comment.trim()
    )
    .map((review) => {
      const contact = Array.isArray(review.contact)
        ? review.contact[0]
        : review.contact;
      return {
        name: publicName(contact?.name || 'Cliente'),
        quote: review.comment as string,
        role: `Avaliação de sessão · ${Number(review.rating)}/5`,
      };
    });
  const googleReviews = (
    settings.google_reviews_enabled ? site.googleReviews : []
  ).map((review) => ({
    name: publicName(review.name),
    quote: review.comment,
    role: `Google · ${review.rating}/5`,
  }));
  const testimonials = settings.show_testimonials
    ? [...publishedReviews, ...googleReviews, ...settings.testimonials].slice(
        0,
        6
      )
    : [];
  const faqs = settings.show_faq ? settings.faqs : [];
  const hasAbout = Boolean(
    settings.about_text || settings.history_text || settings.mission_text
  );
  const navigation = [
    ...(hasServices ? [{ href: '#servicos', label: 'Serviços' }] : []),
    ...(plans.length ? [{ href: '#planos', label: 'Planos e vouchers' }] : []),
    ...(hasAbout ? [{ href: '#sobre', label: 'Sobre' }] : []),
    ...(settings.show_team && team.length
      ? [{ href: '#equipa', label: 'Equipa' }]
      : []),
    { href: '#contacto', label: 'Contacto' },
  ];

  return (
    <div
      className={styles.site}
      data-site-theme={settings.site_theme}
      style={
        {
          '--brand': settings.primary_color || '#9d7144',
          '--accent': settings.accent_color || '#1c241f',
          '--on-brand': onPublicColor(settings.primary_color || '#9d7144'),
          '--on-accent': onPublicColor(settings.accent_color || '#1c241f'),
        } as React.CSSProperties
      }
    >
      <div className={styles.announcement}>
        <span>
          <Sparkles aria-hidden="true" /> Um tempo para cuidar de si
        </span>
        {settings.address && (
          <span className={styles.announcementLocation}>
            <MapPin aria-hidden="true" /> {settings.address}
          </span>
        )}
      </div>

      <header className={styles.header}>
        <Link
          href="/"
          className={styles.logo}
          aria-label={`${account.name}, página inicial`}
        >
          {account.logo_url ? (
            <img src={account.logo_url} alt="" />
          ) : (
            <span>JP</span>
          )}
          <b>{account.name}</b>
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <PublicMobileMenu navigation={navigation} portal={Boolean(portal)} />
        <div className={styles.headerActions}>
          {portal && (
            <Link href="/portal" className={styles.clientArea}>
              Área do cliente
            </Link>
          )}
          <Link href={bookingHref} className={styles.headerCta}>
            <span className={styles.desktopAction}>
              {bookingEnabled ? 'Agendar sessão' : 'Falar connosco'}
            </span>
            <span className={styles.mobileAction}>
              {bookingEnabled ? 'Agendar' : 'Contactar'}
            </span>
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>{settings.hero_title || account.name}</h1>
            {settings.hero_subtitle && (
              <p className={styles.heroText}>{settings.hero_subtitle}</p>
            )}
            <div className={styles.heroButtons}>
              <Link href={bookingHref} className={styles.primaryButton}>
                {bookingEnabled ? 'Quero agendar' : 'Quero saber mais'}{' '}
                <CalendarDays aria-hidden="true" />
              </Link>
              {hasServices && (
                <a href="#servicos" className={styles.textButton}>
                  Explorar massagens <ArrowDownRight aria-hidden="true" />
                </a>
              )}
            </div>
            {(settings.address || settings.opening_hours) && (
              <div className={styles.heroMeta}>
                {settings.address && (
                  <span>
                    <MapPin aria-hidden="true" /> {settings.address}
                  </span>
                )}
                {settings.opening_hours && (
                  <span>
                    <Clock3 aria-hidden="true" /> {settings.opening_hours}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={styles.heroVisual}>
            <img
              src={settings.hero_image_url || fallbackHero}
              alt=""
              fetchPriority="high"
            />
            <div className={styles.imageCaption}>
              <span>JP</span>
              <p>{settings.hero_badge || 'Bem-estar e massoterapia'}</p>
            </div>
          </div>
        </section>

        {settings.show_benefits && settings.benefits.length > 0 && (
          <section
            className={styles.benefitStrip}
            aria-label="Informação sobre a experiência"
          >
            {settings.benefits.slice(0, 3).map((benefit, index) => (
              <article key={`${benefit.title}-${index}`}>
                <Sparkles className={styles.benefitNumber} aria-hidden="true" />
                <div>
                  <h2>{benefit.title}</h2>
                  <p>{benefit.description}</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {hasServices && (
          <section id="servicos" className={styles.services}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Encontre o seu momento.</h2>
              </div>
              <p>
                Veja as opções disponíveis, conheça os detalhes e escolha como
                prefere dar o próximo passo.
              </p>
            </div>
            <PublicServiceCatalogue
              services={visibleServices}
              bookingEnabled={bookingEnabled}
              fallbackImage={settings.hero_image_url || fallbackHero}
              slug={settings.slug}
            />
          </section>
        )}

        {plans.length > 0 && (
          <section id="planos" className={styles.plans}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>
                  Mais momentos para si.
                  <br />
                  Ou para oferecer.
                </h2>
              </div>
              <p>
                Explore os planos da JP Massagem e fale connosco para escolher o
                seu.
              </p>
            </div>
            <div className={styles.planList}>
              {plans.map((plan, index) => (
                <article
                  key={`${plan.name}-${index}`}
                  className={
                    plan.highlighted ? styles.planHighlighted : styles.planRow
                  }
                >
                  <div>
                    <h3>{plan.name}</h3>
                    {plan.description && <p>{plan.description}</p>}
                  </div>
                  {!!plan.features.length && (
                    <ul>
                      {plan.features.map((feature, i) => (
                        <li key={i}>{feature}</li>
                      ))}
                    </ul>
                  )}
                  <div className={styles.planAction}>
                    <strong>{plan.price}</strong>
                    <PublicEnquiryLink
                      slug={settings.slug}
                      subject={`Interesse no plano: ${plan.name}`}
                      className={styles.primaryButton}
                    >
                      Quero saber mais <ArrowUpRight aria-hidden="true" />
                    </PublicEnquiryLink>
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.voucherInvitation}>
              <div>
                <h3>Ofereça um tempo só para cuidar.</h3>
                <p>
                  Peça um voucher à equipa. Confirmamos consigo a modalidade, o
                  valor, a validade e o pagamento antes da emissão.
                </p>
              </div>
              <PublicEnquiryLink
                slug={settings.slug}
                subject="Quero oferecer um voucher"
                className={styles.textButton}
              >
                Pedir um voucher <ArrowUpRight aria-hidden="true" />
              </PublicEnquiryLink>
            </div>
          </section>
        )}

        {hasAbout && (
          <section id="sobre" className={styles.about}>
            <div className={styles.aboutImage}>
              <img
                src={settings.hero_image_url || fallbackHero}
                alt=""
                loading="lazy"
              />
            </div>
            <div className={styles.aboutCopy}>
              <h2>{settings.about_title || account.name}</h2>
              {settings.about_text && <p>{settings.about_text}</p>}
              {settings.history_text && <p>{settings.history_text}</p>}
              {settings.mission_text && <p>{settings.mission_text}</p>}
              <Link href={bookingHref} className={styles.underlinedLink}>
                {bookingEnabled
                  ? 'Agendar a minha sessão'
                  : 'Entrar em contacto'}{' '}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        {settings.show_team && team.length > 0 && (
          <section id="equipa" className={styles.team}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Conheça a equipa.</h2>
              </div>
              <p>
                Veja quem presta os serviços e escolha com quem gostaria de
                falar.
              </p>
            </div>
            <div className={styles.teamGrid}>
              {team.slice(0, 4).map((person) => (
                <Link
                  key={person.id}
                  href={`/profissionais/${encodeURIComponent(person.professional_public_slug || person.id)}`}
                  className={styles.person}
                >
                  <div className={styles.personImage}>
                    {person.avatar_url ? (
                      <img src={person.avatar_url} alt="" loading="lazy" />
                    ) : (
                      <UsersRound aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h3>{person.full_name}</h3>
                    {person.professional_title && (
                      <p>{person.professional_title}</p>
                    )}
                  </div>
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {testimonials.length > 0 && (
          <section id="testemunhos" className={styles.testimonials}>
            <div className={styles.testimonialHeading}>
              <h2>O que dizem os clientes.</h2>
              <Quote aria-hidden="true" />
            </div>
            <div className={styles.testimonialGrid}>
              {testimonials.map((item, index) => (
                <figure
                  key={`${item.name}-${index}`}
                  className={styles.testimonialCard}
                >
                  <div className={styles.testimonialMark} aria-hidden="true">
                    <Quote />
                  </div>
                  <blockquote>“{item.quote}”</blockquote>
                  <figcaption>
                    {item.name}
                    {item.role ? ` · ${item.role}` : ''}
                  </figcaption>
                </figure>
              ))}
            </div>
            {site.googleMapsUrl && site.googleReviews.length > 0 && (
              <a
                className={styles.textButton}
                href={site.googleMapsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ver avaliações no Google <ArrowUpRight aria-hidden="true" />
              </a>
            )}
          </section>
        )}

        {faqs.length > 0 && (
          <section id="perguntas" className={styles.faq}>
            <div>
              <h2>Ficou com alguma dúvida?</h2>
              <p>
                Consulte as respostas partilhadas pela JP Massagem ou envie-nos
                uma mensagem.
              </p>
              <Link href="#contacto" className={styles.textButton}>
                Fazer uma pergunta <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.faqList}>
              {faqs.slice(0, 8).map((item, index) => (
                <details key={`${item.question}-${index}`}>
                  <summary>
                    {item.question}
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section id="contacto" className={styles.contact}>
          <div className={styles.contactCopy}>
            <h2>Vamos encontrar o momento certo para si.</h2>
            <p>
              Envie-nos uma mensagem ou escolha uma sessão, se a marcação online
              estiver disponível.
            </p>
            <div className={styles.contactInfo}>
              {settings.contact_phone && (
                <a href={`tel:${phoneHref}`}>
                  <Phone aria-hidden="true" /> {settings.contact_phone}
                </a>
              )}
              {settings.whatsapp_phone && (
                <a
                  href={`https://wa.me/${whatsappHref}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp <ArrowUpRight aria-hidden="true" />
                </a>
              )}
              {settings.address && (
                <span>
                  <MapPin aria-hidden="true" /> {settings.address}
                </span>
              )}
              {settings.opening_hours && (
                <span>
                  <Clock3 aria-hidden="true" /> {settings.opening_hours}
                </span>
              )}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noreferrer">
                  Ver localização no Google Maps{' '}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              )}
            </div>
            <Link href={bookingHref} className={styles.primaryButton}>
              {bookingEnabled ? 'Agendar sessão' : 'Enviar pedido de contacto'}{' '}
              <CalendarDays aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.formWrap}>
            <PublicLeadForm
              slug={settings.slug}
              primaryColor={settings.primary_color}
            />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/" className={styles.logo}>
          {account.logo_url ? (
            <img src={account.logo_url} alt="" />
          ) : (
            <span>JP</span>
          )}
          <b>{account.name}</b>
        </Link>
        <nav aria-label="Ligações de rodapé">
          {hasServices && <a href="#servicos">Serviços</a>}
          {plans.length > 0 && <a href="#planos">Planos e vouchers</a>}
          <a href="#contacto">Contacto</a>
          {portal && <Link href="/portal">Área do cliente</Link>}
          <Link href="/privacidade">Privacidade</Link>
        </nav>
        <span>
          © {new Date().getFullYear()} {account.name}
        </span>
      </footer>
      {bookingEnabled && (
        <Link href={bookingHref} className={styles.mobileBooking}>
          Quero agendar <CalendarDays aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

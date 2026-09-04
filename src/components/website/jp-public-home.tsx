/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock3, MapPin, Sparkles } from 'lucide-react';
import { serviceSlug } from '@/lib/public-site/service-slug';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './jp-public-home.module.css';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;

export function JpPublicHome({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const booking = settings.show_booking && portal?.booking_enabled ? '/portal?book=1' : '#contacto';
  const visibleServices = services.filter((item) => !item.coming_soon).slice(0, 6);
  const price = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: account.default_currency || 'EUR' });
  return <div className={styles.page} style={{ '--jp-brand': settings.primary_color, '--jp-ink': settings.accent_color } as React.CSSProperties}>
    <header className={styles.header}><Link href="/" className={styles.brand}>{account.logo_url ? <img src={account.logo_url} alt="" /> : <i>JP</i>}<span>{account.name}</span></Link><nav><a href="#servicos">Experiências</a><a href="#sobre">A clínica</a><a href="#contacto">Contacto</a></nav><div className={styles.actions}><Link href="/portal">Área do cliente</Link><Link href={booking} className={styles.book}>Marcar sessão <ArrowUpRight /></Link></div></header>
    <main>
      <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}><Sparkles /> {settings.hero_badge || 'Bem-estar com intenção'}</p><h1>{settings.hero_title}</h1><p className={styles.lead}>{settings.hero_subtitle || 'Uma pausa pensada para restaurar o seu ritmo e o seu bem-estar.'}</p><Link href={booking} className={styles.heroCta}>Encontrar a sua sessão <ArrowUpRight /></Link><div className={styles.note}><span /> Marcação online com disponibilidade confirmada</div></div><div className={styles.heroImage}>{settings.hero_image_url ? <img src={settings.hero_image_url} alt="Ambiente JP Massagem" /> : <div className={styles.imageFallback} />}<aside><b>Um momento só seu.</b><span>Com calma, cuidado e presença.</span></aside></div></section>
      <section className={styles.intro}><p>Na JP Massagem, cada visita começa por escutar.</p><div><span>01</span><b>Escolha a experiência</b><small>Conheça cada modalidade antes de marcar.</small></div><div><span>02</span><b>Reserve o seu momento</b><small>Profissional, data e horário, sem complicações.</small></div><div><span>03</span><b>Cuide de si</b><small>Um atendimento feito ao seu ritmo.</small></div></section>
      {settings.show_services && visibleServices.length > 0 && <section id="servicos" className={styles.services}><header><p className={styles.eyebrow}>Experiências</p><h2>O que o seu corpo pede hoje?</h2><Link href={booking}>Marcar uma sessão <ArrowUpRight /></Link></header><div className={styles.serviceGrid}>{visibleServices.map((service, index) => <Link key={service.id} href={`/servicos/${serviceSlug(service.name)}`} className={styles.service}><span>0{index + 1}</span><h3>{service.name}</h3><p>{service.public_presentation || service.description || 'Uma experiência de bem-estar preparada para si.'}</p><footer><em><Clock3 />{service.duration_minutes} min</em><strong>{Number(service.price) ? price.format(Number(service.price)) : 'Consultar'}</strong></footer><ArrowUpRight className={styles.serviceArrow} /></Link>)}</div></section>}
      <section id="sobre" className={styles.story}><div className={styles.storyBlock}><p className={styles.eyebrow}>A nossa forma de cuidar</p><h2>{settings.about_title}</h2><p>{settings.about_text || 'Criamos uma experiência serena, profissional e realmente pessoal, onde cada detalhe é pensado para o seu conforto.'}</p></div><div className={styles.people}><p>Profissionais que acompanham a sua experiência.</p>{team.slice(0, 3).map((person) => <Link key={person.id} href={`/profissionais/${encodeURIComponent(person.professional_public_slug || person.id)}`}><span>{person.avatar_url ? <img src={person.avatar_url} alt="" /> : person.full_name.slice(0, 1)}</span><b>{person.full_name}</b><small>{person.professional_title || 'Profissional'}</small></Link>)}</div></section>
      <section id="contacto" className={styles.contact}><div><p className={styles.eyebrow}>Vamos conversar</p><h2>O seu bem-estar merece espaço na agenda.</h2><Link href={booking} className={styles.heroCta}>Marcar agora <CalendarDays /></Link></div><address>{settings.contact_phone && <p>{settings.contact_phone}</p>}{settings.address && <p><MapPin /> {settings.address}</p>}{settings.opening_hours && <p><Clock3 /> {settings.opening_hours}</p>}</address></section>
    </main><footer className={styles.footer}><b>{account.name}</b><span>© {new Date().getFullYear()} · Todos os direitos reservados.</span></footer>
  </div>;
}

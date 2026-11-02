/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  MessageCircle,
} from 'lucide-react';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import type { SitePlan } from '@/lib/public-site/types';
import { onPublicColor } from '@/lib/public-site/journey';
import { publicPlanInfo, publicPlanWhatsApp } from '@/lib/public-site/plans';
import { serviceSlug } from '@/lib/public-site/service-slug';
import styles from './jp-massagem-public-site.module.css';
type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;

export function PublicPlanDetails({
  site,
  plan,
}: {
  site: Site;
  plan: SitePlan;
}) {
  const { settings, account } = site;
  const { pack, price, unavailable } = publicPlanInfo(
    plan,
    site.planPacks || []
  );
  const home = `/site/${encodeURIComponent(settings.slug)}`;
  const whatsapp = publicPlanWhatsApp(
    settings.whatsapp_phone,
    plan.name,
    price
  );
  const sessions = pack?.items.reduce((sum, item) => sum + item.sessions, 0);
  return (
    <div
      className={styles.site}
      style={
        {
          '--brand': settings.primary_color || '#9d7144',
          '--accent': settings.accent_color || '#1c241f',
          '--on-brand': onPublicColor(settings.primary_color || '#9d7144'),
          '--on-accent': onPublicColor(settings.accent_color || '#1c241f'),
        } as React.CSSProperties
      }
    >
      <header className={styles.planPageHeader}>
        <Link href={home} className={styles.logo}>
          {account.logo_url && <img src={account.logo_url} alt="" />}
          <b>{account.name}</b>
        </Link>
        <Link href={`${home}#planos`} className={styles.textButton}>
          <ArrowLeft aria-hidden="true" />
          Todos os planos
        </Link>
      </header>
      <main className={styles.planPage}>
        <div className={styles.planStory}>
          <h1>{plan.name}</h1>
          {plan.description && (
            <p className={styles.planIntroduction}>{plan.description}</p>
          )}
          <p className={styles.planLeadPrice}>{price}</p>
          {pack && (
            <>
              <dl className={styles.planFacts}>
                <div>
                  <dt>Sessões incluídas</dt>
                  <dd>{sessions}</dd>
                </div>
                <div>
                  <dt>Validade do pack</dt>
                  <dd>{pack.validity_days} dias</dd>
                </div>
              </dl>
              <section aria-labelledby="included-title">
                <h2 id="included-title">O que está incluído</h2>
                {pack.name !== plan.name && (
                  <p className={styles.planPackName}>{pack.name}</p>
                )}
                {pack.description && pack.description !== plan.description && (
                  <p className={styles.planDescription}>{pack.description}</p>
                )}
                <ul className={styles.planSessions}>
                  {pack.items.map((item) => (
                    <li key={item.service_id}>
                      <div>
                        <h3>{item.name}</h3>
                        <p>
                          <Clock3 aria-hidden="true" />
                          {item.sessions}{' '}
                          {item.sessions === 1 ? 'sessão' : 'sessões'} ·{' '}
                          {item.duration_minutes} min por sessão
                        </p>
                      </div>
                      <Link
                        href={`/servicos/${serviceSlug(item.name)}`}
                        className={styles.textButton}
                      >
                        Conhecer <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
          {!!plan.features.length && (
            <section aria-labelledby="experience-title">
              <h2 id="experience-title">A sua experiência</h2>
              <ul className={styles.planFeatures}>
                {plan.features.map((feature, index) => (
                  <li key={index}>
                    <Check aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!unavailable && (
            <section className={styles.planNextSteps}>
              <h2>Gostou deste plano?</h2>
              <p>
                Fale com a equipa para aderir ou esclarecer as suas dúvidas.
                Confirmamos consigo as condições, os horários e a forma de
                pagamento antes da compra.
              </p>
            </section>
          )}
        </div>
        <aside
          className={styles.planPurchase}
          aria-label="Valor e próximo passo"
        >
          <p className={styles.planPriceLabel}>
            {unavailable ? 'Disponibilidade' : 'Valor do plano'}
          </p>
          <strong className={styles.planPrice}>{price}</strong>
          {pack && (
            <p>
              {sessions}{' '}
              {sessions === 1 ? 'sessão incluída' : 'sessões incluídas'} ·{' '}
              {pack.validity_days} dias de validade
            </p>
          )}
          {unavailable ? (
            <>
              <p>
                Este pack já não está disponível para adesão. Consulte as outras
                opções publicadas.
              </p>
              <Link href={`${home}#planos`} className={styles.primaryButton}>
                Ver outros planos <ArrowUpRight aria-hidden="true" />
              </Link>
            </>
          ) : (
            <>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.primaryButton}
                >
                  Quero este plano <MessageCircle aria-hidden="true" />
                </a>
              )}
              {!whatsapp && settings.contact_phone && (
                <a
                  href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`}
                  className={styles.primaryButton}
                >
                  Falar com a equipa <ArrowUpRight aria-hidden="true" />
                </a>
              )}
              <Link
                href={`${home}#contacto`}
                className={
                  whatsapp || settings.contact_phone
                    ? styles.textButton
                    : styles.primaryButton
                }
              >
                {whatsapp || settings.contact_phone
                  ? 'Outras formas de contacto'
                  : 'Pedir este plano'}
                <ArrowUpRight aria-hidden="true" />
              </Link>
              <p className={styles.planPurchaseNote}>
                Pode consultar todas as informações nesta página sem preencher
                um formulário.
              </p>
            </>
          )}
        </aside>
      </main>
      <footer className={styles.planPageFooter}>
        <Link href={`${home}#planos`} className={styles.textButton}>
          <ArrowLeft aria-hidden="true" />
          Voltar aos planos
        </Link>
        <Link href="/privacidade">Privacidade</Link>
      </footer>
    </div>
  );
}

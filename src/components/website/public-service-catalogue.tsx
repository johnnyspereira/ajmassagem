/* eslint-disable @next/next/no-img-element */
'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  filterPublicServices,
  publicPrice,
  publicServiceLinks,
  togglePublicComparison,
  type PublicService,
} from '@/lib/public-site/journey';
import { PublicEnquiryLink } from './public-enquiry-link';
import styles from './jp-massagem-public-site.module.css';

export function PublicServiceCatalogue({
  services,
  bookingEnabled,
  fallbackImage,
  slug,
}: {
  services: PublicService[];
  bookingEnabled: boolean;
  fallbackImage: string;
  slug: string;
}) {
  const [search, setSearch] = useState(''),
    [duration, setDuration] = useState('all'),
    [sort, setSort] = useState('name');
  const [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const filtered = filterPublicServices(services, search, duration, sort);
  const compared = services.filter((s) => selected.includes(s.id));
  const sameCurrency = new Set(services.map((s) => s.currency)).size === 1;
  function toggle(id: string) {
    setSelected((current) => togglePublicComparison(current, id));
    setNotice(
      selected.length >= 3 && !selected.includes(id)
        ? 'Pode comparar até três serviços. Retire um para escolher outro.'
        : ''
    );
  }
  return (
    <div className={styles.catalogue}>
      <div className={styles.catalogueToolbar}>
        <label className={styles.catalogueSearch}>
          <Search aria-hidden="true" />
          <span className={styles.srOnly}>Pesquisar serviços</span>
          <input
            type="search"
            placeholder="Qual é o seu momento de hoje?"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span>
            <Clock3 aria-hidden="true" />
            Tempo disponível
          </span>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="all">Todas</option>
            <option value="short">Até 60 min</option>
            <option value="long">Mais de 60 min</option>
          </select>
        </label>
        <label>
          <span>
            <SlidersHorizontal aria-hidden="true" />
            Ordenar por
          </span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Nome</option>
            <option value="duration">Duração</option>
            {sameCurrency && <option value="price">Preço</option>}
          </select>
        </label>
      </div>
      <div className={styles.catalogueSummary}>
        <p role="status">
          {filtered.length} de {services.length} serviço(s)
          {search || duration !== 'all' ? ' encontrados' : ''}
        </p>
        <span>Compare até três para escolher com calma.</span>
      </div>
      {compared.length > 0 && (
        <div className={styles.comparisonTray}>
          <div>
            {compared.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => toggle(s.id)}
                aria-label={`Retirar ${s.name} da comparação`}
              >
                {s.name}
                <X aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={compared.length < 2}
            onClick={() => dialog.current?.showModal()}
          >
            Comparar {compared.length} serviços
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className={styles.catalogueNotice}>
          {notice}
        </p>
      )}
      {!filtered.length ? (
        <div className={styles.catalogueEmpty}>
          <h3>Vamos tentar outra pesquisa?</h3>
          <p>Experimente o nome da massagem ou consulte todas as opções.</p>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setSearch('');
              setDuration('all');
            }}
          >
            Ver todos os serviços <ArrowRight aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className={styles.serviceGrid}>
          {filtered.map((s) => {
            const links = publicServiceLinks(s, bookingEnabled);
            return (
              <article key={s.id} className={styles.serviceCard}>
                <Link
                  href={links.details}
                  className={styles.serviceImageLink}
                  aria-label={`Conhecer ${s.name}`}
                >
                  <div className={styles.serviceImage}>
                    <img
                      src={s.public_image_url || fallbackImage}
                      alt=""
                      loading="lazy"
                      width={640}
                      height={420}
                    />
                  </div>
                </Link>
                <div className={styles.serviceBody}>
                  <h3>
                    <Link href={links.details}>{s.name}</Link>
                  </h3>
                  {(s.public_presentation || s.description) && (
                    <p className={styles.serviceDescription}>
                      {s.public_presentation || s.description}
                    </p>
                  )}
                  <div className={styles.serviceMeta}>
                    <span>
                      <Clock3 aria-hidden="true" />
                      {s.duration_minutes} min
                    </span>
                    <strong>{publicPrice(s.price, s.currency)}</strong>
                  </div>
                  <div className={styles.catalogueCardActions}>
                    {bookingEnabled ? (
                      <Link
                        href={links.booking}
                        className={styles.primaryButton}
                      >
                        Agendar <CalendarDays aria-hidden="true" />
                      </Link>
                    ) : (
                      <PublicEnquiryLink
                        slug={slug}
                        subject={`Informações: ${s.name}`}
                        className={styles.primaryButton}
                      >
                        Pedir informações <ArrowRight aria-hidden="true" />
                      </PublicEnquiryLink>
                    )}
                    <Link href={links.details} className={styles.textButton}>
                      Detalhes <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                  <button
                    type="button"
                    className={styles.compareToggle}
                    aria-pressed={selected.includes(s.id)}
                    onClick={() => toggle(s.id)}
                  >
                    <span aria-hidden="true">
                      {selected.includes(s.id) && <Check />}
                    </span>
                    {selected.includes(s.id)
                      ? 'Na comparação'
                      : 'Comparar este serviço'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <dialog
        ref={dialog}
        className={styles.compareDialog}
        aria-labelledby="public-compare-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.compareShell}>
          <header>
            <div>
              <h2 id="public-compare-title">O seu tempo, a sua escolha.</h2>
              <p>Compare duração, valor e as informações de cada sessão.</p>
            </div>
            <button
              type="button"
              className={styles.closeCompare}
              aria-label="Fechar comparação"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </header>
          <div className={styles.compareScroll}>
            {compared.map((s) => {
              const links = publicServiceLinks(s, bookingEnabled);
              return (
                <section key={s.id} className={styles.compareService}>
                  <h3>{s.name}</h3>
                  <p className={styles.comparePrice}>
                    {publicPrice(s.price, s.currency)}{' '}
                    <span>· {s.duration_minutes} minutos</span>
                  </p>
                  <p>
                    {s.public_presentation ||
                      s.description ||
                      'Consulte os detalhes ou fale com a equipa para saber mais.'}
                  </p>
                  {!!s.public_benefits?.length && (
                    <>
                      <h4>O que pode esperar</h4>
                      <ul>
                        {s.public_benefits.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!!s.public_considerations?.length && (
                    <>
                      <h4>Antes de escolher</h4>
                      <ul>
                        {s.public_considerations.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <Link
                    href={bookingEnabled ? links.booking : links.details}
                    className={styles.primaryButton}
                  >
                    {bookingEnabled
                      ? 'Escolher esta sessão'
                      : 'Conhecer o serviço'}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </section>
              );
            })}
          </div>
          <footer>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => dialog.current?.close()}
            >
              Voltar aos serviços
            </button>
            <p>A marcação fica sujeita aos horários disponíveis no Portal.</p>
          </footer>
        </div>
      </dialog>
    </div>
  );
}

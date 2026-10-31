import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { JpMassagemPublicSite } from './jp-massagem-public-site';
type Site = Parameters<typeof JpMassagemPublicSite>[0]['site'];
const fixture = {
  account: { name: 'Empresa de teste', default_currency: 'EUR' },
  settings: {
    slug: 'test',
    primary_color: '#9d7144',
    accent_color: '#1c241f',
    hero_title: 'Momento de teste',
    show_services: true,
    show_booking: false,
    show_plans: true,
    plans: [
      {
        name: 'Plano de teste',
        price: '45,50 €',
        description: 'Descrição',
        features: ['Uma sessão'],
      },
    ],
    show_testimonials: true,
    google_reviews_enabled: false,
    testimonials: [
      { name: 'Testemunho configurado', quote: 'Texto configurado', role: '' },
    ],
    show_faq: false,
    faqs: [],
    benefits: [],
  },
  services: [],
  team: [],
  portal: { booking_enabled: true },
  reviews: [
    {
      rating: 5,
      comment: 'Avaliação publicada de demonstração',
      contact: { name: 'Cliente Nome Completo' },
    },
  ],
  googleReviews: [
    {
      rating: 4,
      comment: 'Google desativado de demonstração',
      name: 'Google Nome',
    },
  ],
} as unknown as Site;
it('honors publication toggles, excludes disabled Google reviews and shortens published names', () => {
  const html = renderToStaticMarkup(
    createElement(JpMassagemPublicSite, { site: fixture })
  );
  expect(html).toContain('Plano de teste');
  expect(html).toContain('Cliente C.');
  expect(html).not.toContain('Cliente Nome Completo');
  expect(html).not.toContain('Google desativado de demonstração');
  expect(html).toContain('Testemunho configurado');
  expect(html).not.toContain('/portal?book=1');
});
it('does not render hidden plans, testimonials, services or team', () => {
  const site = {
    ...fixture,
    settings: {
      ...fixture.settings,
      show_plans: false,
      show_testimonials: false,
      show_services: false,
      show_team: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(JpMassagemPublicSite, { site })
  );
  for (const id of ['planos', 'testemunhos', 'servicos', 'equipa'])
    expect(html).not.toContain(`id="${id}"`);
  expect(html).not.toContain('Plano de teste');
});

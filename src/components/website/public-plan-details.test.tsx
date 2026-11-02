import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PublicPlanDetails } from './public-plan-details';
type Site = Parameters<typeof PublicPlanDetails>[0]['site'];
const plan = {
  name: 'Essencial',
  price: 'Valor antigo',
  description: 'Descrição do plano',
  features: ['Atendimento individual'],
  pack_id: 'pack',
};
const site = {
  account: { name: 'JP Massagem' },
  settings: {
    slug: 'test',
    primary_color: '#9d7144',
    accent_color: '#1c241f',
    whatsapp_phone: '+351000000000',
  },
  planPacks: [
    {
      id: 'pack',
      name: 'Pack Relaxante',
      description: 'Duas sessões de relaxamento.',
      price: 70.5,
      currency: 'EUR',
      validity_days: 90,
      items: [
        {
          service_id: 'service',
          name: 'Massagem Relaxante',
          duration_minutes: 50,
          sessions: 2,
        },
      ],
    },
  ],
} as unknown as Site;
it('provides composition, duration, validity and canonical price before contact, without a form gate', () => {
  const html = renderToStaticMarkup(
    createElement(PublicPlanDetails, { site, plan })
  );
  for (const text of [
    'Massagem Relaxante',
    '50 min por sessão',
    '90 dias',
    '70,50',
    'Quero este plano',
    'wa.me/351000000000',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Valor antigo');
});
it('keeps independent plan copy without inventing sessions or validity', () => {
  const html = renderToStaticMarkup(
    createElement(PublicPlanDetails, { site, plan: { ...plan, pack_id: null } })
  );
  expect(html).toContain('Descrição do plano');
  expect(html).toContain('Atendimento individual');
  expect(html).not.toContain('Validade do pack');
  expect(html).not.toContain('Sessões incluídas');
});
it('withholds acquisition links when the linked pack is no longer published', () => {
  const html = renderToStaticMarkup(
    createElement(PublicPlanDetails, { site: { ...site, planPacks: [] }, plan })
  );
  expect(html).toContain('Indisponível');
  expect(html).not.toContain('wa.me');
  expect(html).not.toContain('Valor antigo');
});

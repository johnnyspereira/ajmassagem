import { expect, it } from 'vitest';
import { publicPlanHref, publicPlanInfo, publicPlanWhatsApp } from './plans';
import type { PublicPlanPack } from './types';
const plan = {
  name: 'Essencial',
  price: '59 €',
  description: 'Texto',
  features: [],
  pack_id: 'pack',
};
const pack: PublicPlanPack = {
  id: 'pack',
  name: 'Pack real',
  price: 70.5,
  currency: 'EUR',
  description: 'Descrição',
  validity_days: 90,
  items: [
    {
      service_id: 'service',
      name: 'Massagem',
      duration_minutes: 50,
      sessions: 2,
    },
  ],
};
it('uses the linked catalogue price instead of stale marketing text', () => {
  expect(publicPlanInfo(plan, [pack]).price).toContain('70,50');
  expect(publicPlanInfo({ ...plan, pack_id: null }, []).price).toBe('59 €');
});
it('does not offer a missing, inactive or foreign pack at the old price', () => {
  expect(publicPlanInfo(plan, [])).toMatchObject({
    unavailable: true,
    price: 'Indisponível',
  });
});
it('creates distinct detail URLs even for repeated plan names', () => {
  expect(publicPlanHref('site', plan, 0)).toBe('/site/site/planos/1-essencial');
  expect(publicPlanHref('site', plan, 1)).toBe('/site/site/planos/2-essencial');
});
it('opens WhatsApp with the chosen plan and price without sending anything', () => {
  const url = new URL(
    publicPlanWhatsApp('+351 000 000 000', 'Essencial', '70,50 €')!
  );
  expect(url.pathname).toBe('/351000000000');
  expect(url.searchParams.get('text')).toContain('Essencial');
  expect(url.searchParams.get('text')).toContain('70,50 €');
  expect(publicPlanWhatsApp(null, 'Essencial', '59 €')).toBeNull();
});

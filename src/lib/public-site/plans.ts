import { serviceSlug } from './service-slug';
import type { PublicPlanPack, SitePlan } from './types';
export function publicPlanKey(plan: SitePlan, index: number) {
  return `${index + 1}-${serviceSlug(plan.name) || 'plano'}`;
}
export function publicPlanHref(slug: string, plan: SitePlan, index: number) {
  return `/site/${encodeURIComponent(slug)}/planos/${publicPlanKey(plan, index)}`;
}
export function publicPlanInfo(plan: SitePlan, packs: PublicPlanPack[]) {
  const pack = plan.pack_id
    ? packs.find((p) => p.id === plan.pack_id)
    : undefined;
  const unavailable = Boolean(plan.pack_id && !pack);
  return {
    pack,
    unavailable,
    price: unavailable
      ? 'Indisponível'
      : pack
        ? new Intl.NumberFormat('pt-PT', {
            style: 'currency',
            currency: pack.currency,
          }).format(pack.price)
        : plan.price,
  };
}
export function publicPlanWhatsApp(
  phone: string | null,
  name: string,
  price: string
) {
  const number = phone?.replace(/\D/g, '') || '';
  if (number.length < 8 || number.length > 15) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(`Olá! Vi o plano ${name} no site da JP Massagem (${price}) e gostaria de aderir. Podem ajudar-me?`)}`;
}

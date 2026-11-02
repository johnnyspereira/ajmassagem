import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPlanDetails } from '@/components/website/public-plan-details';
import { getPublicBusinessSite } from '@/lib/public-site/server';
import { publicPlanHref, publicPlanKey } from '@/lib/public-site/plans';
import { shareMetadata } from '@/lib/sharing/metadata';
type Props = { params: Promise<{ slug: string; plan: string }> };
async function findPlan(params: Props['params']) {
  const { slug, plan: key } = await params;
  const site = await getPublicBusinessSite(slug);
  if (!site || !site.settings.show_plans) return null;
  const index = site.settings.plans.findIndex(
    (plan, index) => publicPlanKey(plan, index) === key
  );
  return index < 0 ? null : { site, plan: site.settings.plans[index], index };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await findPlan(params);
  if (!result)
    return shareMetadata({
      title: 'Plano indisponível',
      description: 'Consulte os planos disponíveis no site.',
    });
  const { site, plan, index } = result;
  return shareMetadata({
    title: plan.name,
    description:
      plan.description || `Conheça os detalhes do plano ${plan.name}.`,
    brand: site.account.name,
    path: publicPlanHref(site.settings.slug, plan, index),
    index: true,
  });
}
export default async function PlanPage({ params }: Props) {
  const result = await findPlan(params);
  if (!result) notFound();
  return <PublicPlanDetails site={result.site} plan={result.plan} />;
}

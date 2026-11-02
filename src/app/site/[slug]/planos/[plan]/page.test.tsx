import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ site: vi.fn() }));
vi.mock('@/lib/public-site/server', () => ({
  getPublicBusinessSite: mocks.site,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Error('not-found');
  },
}));
import PlanPage from './page';
const plan = {
  name: 'Essencial',
  price: '59 €',
  description: 'Texto',
  features: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.site.mockResolvedValue({
    settings: { slug: 'account-site', show_plans: true, plans: [plan] },
  });
});
it('resolves only the plan of the requested published site', async () => {
  const result = await PlanPage({
    params: Promise.resolve({ slug: 'account-site', plan: '1-essencial' }),
  });
  expect(mocks.site).toHaveBeenCalledWith('account-site');
  expect(result.props.plan).toEqual(plan);
});
it.each([
  null,
  { settings: { show_plans: false, plans: [plan] } },
  { settings: { show_plans: true, plans: [] } },
])('returns not found for hidden or missing plans', async (site) => {
  mocks.site.mockResolvedValue(site);
  await expect(
    PlanPage({
      params: Promise.resolve({ slug: 'account-site', plan: '1-essencial' }),
    })
  ).rejects.toThrow('not-found');
});

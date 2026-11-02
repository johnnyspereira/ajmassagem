import { beforeEach, expect, it, vi } from 'vitest';
const select = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mysql/db', () => ({ selectRows: select }));
import { loadPublicPlanPacks } from './plan-packs';
const id = '00000000-0000-4000-8000-000000000001';
const plan = {
  name: 'Plano',
  price: '59 €',
  description: '',
  features: [],
  pack_id: id,
};
const row = {
  id,
  name: 'Pack',
  description: 'Descrição',
  price: '59.50',
  currency: 'EUR',
  validity_days: 90,
  service_id: 'service',
  service_name: 'Massagem',
  duration_minutes: 50,
  service_active: 1,
  online_enabled: 1,
  show_on_site: 1,
  coming_soon: 0,
  sessions: 2,
};
beforeEach(() => {
  vi.clearAllMocks();
  select.mockResolvedValue([row]);
});
it('does not read or publish the full catalogue for independent plans', async () => {
  expect(
    await loadPublicPlanPacks('account', [{ ...plan, pack_id: null }])
  ).toEqual([]);
  expect(select).not.toHaveBeenCalled();
});
it('publishes only explicitly linked active packs from the same account, with a public field allowlist', async () => {
  const packs = await loadPublicPlanPacks('account', [plan, plan]);
  const [sql, values] = select.mock.calls[0];
  expect(values).toEqual(['account', id]);
  expect(sql).toContain('p.account_id=? AND p.is_active=TRUE AND p.id IN (?)');
  expect(sql).toContain('s.account_id=p.account_id');
  expect(sql).not.toMatch(
    /SELECT \*|finance_client_packs|pin_code|finance_sales/
  );
  expect(packs[0]).toEqual({
    id,
    name: 'Pack',
    description: 'Descrição',
    price: 59.5,
    currency: 'EUR',
    validity_days: 90,
    items: [
      {
        service_id: 'service',
        name: 'Massagem',
        duration_minutes: 50,
        sessions: 2,
      },
    ],
  });
});
it.each([
  { service_id: null },
  { service_active: 0 },
  { online_enabled: 0 },
  { show_on_site: 0 },
  { coming_soon: 1 },
  { sessions: 0 },
  { sessions: 1.5 },
  { duration_minutes: 0 },
  { validity_days: 0 },
])(
  'withholds a pack with unpublished or invalid composition: %j',
  async (change) => {
    select.mockResolvedValue([{ ...row, ...change }]);
    expect(await loadPublicPlanPacks('account', [plan])).toEqual([]);
  }
);
it('does not silently publish only part of a mixed-visibility pack', async () => {
  select.mockResolvedValue([
    row,
    { ...row, service_id: 'hidden', show_on_site: 0 },
  ]);
  expect(await loadPublicPlanPacks('account', [plan])).toEqual([]);
});

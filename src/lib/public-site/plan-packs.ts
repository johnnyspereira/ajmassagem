import type { RowDataPacket } from 'mysql2';
import { selectRows } from '@/lib/mysql/db';
import type { PublicPlanPack, SitePlan } from './types';

/** Explicit publication via plan.pack_id; never expose client packs or private finance fields. */
export async function loadPublicPlanPacks(
  accountId: string,
  plans: SitePlan[]
): Promise<PublicPlanPack[]> {
  const ids = [
    ...new Set(
      plans
        .map((p) => p.pack_id)
        .filter(
          (id): id is string =>
            typeof id === 'string' && /^[\da-f-]{36}$/i.test(id)
        )
    ),
  ];
  if (!ids.length) return [];
  const rows = await selectRows<RowDataPacket[]>(
    `SELECT p.id,p.name,p.description,p.price,p.currency,p.validity_days,
    s.id service_id,s.name service_name,s.duration_minutes,s.is_active service_active,s.online_enabled,s.show_on_site,s.coming_soon,i.sessions
    FROM finance_pack_catalog p LEFT JOIN finance_pack_items i ON i.pack_id=p.id
    LEFT JOIN clinic_services s ON s.id=i.service_id AND s.account_id=p.account_id
    WHERE p.account_id=? AND p.is_active=TRUE AND p.id IN (${ids.map(() => '?').join(',')}) ORDER BY p.id,s.name`,
    [accountId, ...ids]
  );
  const packs = new Map<string, PublicPlanPack>(),
    invalid = new Set<string>();
  for (const r of rows) {
    if (
      !r.service_id ||
      !r.service_active ||
      !r.online_enabled ||
      !r.show_on_site ||
      r.coming_soon ||
      Number(r.sessions) < 1 ||
      !Number.isInteger(Number(r.sessions)) ||
      Number(r.duration_minutes) < 1
    )
      invalid.add(r.id);
    if (!packs.has(r.id))
      packs.set(r.id, {
        id: r.id,
        name: r.name,
        description: r.description,
        price: Number(r.price),
        currency: r.currency,
        validity_days: Number(r.validity_days),
        items: [],
      });
    packs
      .get(r.id)!
      .items.push({
        service_id: r.service_id,
        name: r.service_name,
        duration_minutes: Number(r.duration_minutes),
        sessions: Number(r.sessions),
      });
  }
  return [...packs.values()].filter(
    (p) =>
      !invalid.has(p.id) &&
      Number.isFinite(p.price) &&
      p.price >= 0 &&
      Number.isInteger(p.validity_days) &&
      p.validity_days > 0
  );
}

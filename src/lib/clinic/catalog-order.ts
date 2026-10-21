export const catalogTables = {
  services: 'clinic_services',
  products: 'clinic_products',
  rooms: 'clinic_rooms',
  packs: 'finance_pack_catalog',
} as const;
export type CatalogKind = keyof typeof catalogTables;
export function sortCatalog<T extends { name: string; sort_order?: number }>(
  items: T[]
) {
  return [...items].sort(
    (a, b) =>
      Number(a.sort_order ?? 1000000) - Number(b.sort_order ?? 1000000) ||
      a.name.localeCompare(b.name, 'pt')
  );
}
export function moveCatalogItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length)
    return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

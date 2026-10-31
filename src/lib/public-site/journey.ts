import { serviceSlug } from './service-slug';

export type PublicService = {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration_minutes: number;
  description?: string | null;
  public_presentation?: string | null;
  public_image_url?: string | null;
  public_benefits?: string[] | null;
  public_considerations?: string[] | null;
};
export function togglePublicComparison(selected: string[], id: string) {
  return selected.includes(id)
    ? selected.filter((value) => value !== id)
    : selected.length < 3
      ? [...selected, id]
      : selected;
}
export const publicSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT');
export function filterPublicServices(
  services: PublicService[],
  search: string,
  duration: string,
  sort: string
) {
  const query = publicSearchText(search.trim());
  const filtered = services.filter(
    (s) =>
      (!query ||
        publicSearchText(
          `${s.name} ${s.public_presentation || s.description || ''}`
        ).includes(query)) &&
      (duration === 'all' ||
        (duration === 'short'
          ? Number(s.duration_minutes) <= 60
          : Number(s.duration_minutes) > 60))
  );
  return filtered.sort((a, b) =>
    sort === 'duration'
      ? Number(a.duration_minutes) - Number(b.duration_minutes)
      : sort === 'price'
        ? Number(a.price) - Number(b.price)
        : a.name.localeCompare(b.name, 'pt-PT')
  );
}
export function publicServiceLinks(
  service: Pick<PublicService, 'id' | 'name'>,
  booking: boolean
) {
  return {
    details: `/servicos/${serviceSlug(service.name)}`,
    booking: booking
      ? `/portal?book=1&service=${encodeURIComponent(service.id)}`
      : '#contacto',
  };
}
export function publicPrice(value: number, currency: string) {
  if (Number(value) <= 0) return 'Sob consulta';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function publicName(value: string) {
  const names = value.trim().split(/\s+/);
  return names.length > 1
    ? `${names[0]} ${Array.from(names[names.length - 1])[0]}.`
    : names[0] || 'Cliente';
}
/** Choose readable text on the configured brand color, including pale custom colors. */
export function onPublicColor(value: string) {
  const match = /^#([\da-f]{6})$/i.exec(value);
  if (!match) return '#ffffff';
  const rgb = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#ffffff';
}

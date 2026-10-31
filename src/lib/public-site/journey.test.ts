import { expect, it } from 'vitest';
import {
  filterPublicServices,
  onPublicColor,
  publicName,
  publicPrice,
  publicServiceLinks,
  togglePublicComparison,
  type PublicService,
} from './journey';
const services: PublicService[] = Array.from({ length: 8 }, (_, i) => ({
  id: `service ${i}`,
  name: i === 7 ? 'Esfoliação corporal' : `Massagem ${i}`,
  price: 35 + i + 0.5,
  currency: 'EUR',
  duration_minutes: i === 7 ? 90 : 50,
  description: 'Informação configurada pela clínica',
}));
it('limits rapid comparison selections to three and allows removing or replacing choices', () => {
  const selected = ['a', 'b', 'c', 'd'].reduce(
    togglePublicComparison,
    [] as string[]
  );
  expect(selected).toEqual(['a', 'b', 'c']);
  expect(togglePublicComparison(selected, 'b')).toEqual(['a', 'c']);
  expect(
    togglePublicComparison(togglePublicComparison(selected, 'b'), 'd')
  ).toEqual(['a', 'c', 'd']);
});
it('keeps every published service supplied to the catalogue, without a six-item cap', () => {
  expect(filterPublicServices(services, '', 'all', 'name')).toHaveLength(8);
});
it('searches accents and descriptions and combines the duration filter', () => {
  expect(
    filterPublicServices(services, 'esfoliacao', 'long', 'name').map(
      (s) => s.id
    )
  ).toEqual(['service 7']);
  expect(filterPublicServices(services, 'esfoliacao', 'short', 'name')).toEqual(
    []
  );
  expect(
    filterPublicServices(services, 'clinica', 'short', 'name')
  ).toHaveLength(7);
});
it('sorts without modifying the original catalogue', () => {
  const ids = services.map((s) => s.id);
  expect(filterPublicServices(services, '', 'all', 'price')[0].price).toBe(
    35.5
  );
  expect(services.map((s) => s.id)).toEqual(ids);
});
it('uses the existing Portal service selector and an enquiry anchor when booking is disabled', () => {
  expect(publicServiceLinks(services[7], true)).toEqual({
    details: '/servicos/esfoliacao-corporal',
    booking: '/portal?book=1&service=service%207',
  });
  expect(publicServiceLinks(services[7], false).booking).toBe('#contacto');
});
it('keeps minor currency units and never invents a price for consultation-only services', () => {
  expect(publicPrice(45.5, 'EUR')).toContain('45,50');
  expect(publicPrice(0, 'EUR')).toBe('Sob consulta');
});
it('shortens names and chooses readable text on configurable colors', () => {
  expect(publicName('Cliente de Demonstração')).toBe('Cliente D.');
  expect(publicName('Ana')).toBe('Ana');
  expect(onPublicColor('#ffffff')).toBe('#000000');
  expect(onPublicColor('#1c241f')).toBe('#ffffff');
});

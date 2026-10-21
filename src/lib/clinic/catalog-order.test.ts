import { expect, it } from 'vitest';
import { moveCatalogItem, sortCatalog } from './catalog-order';
it('keeps saved priorities first and new items at the end without mutating the input', () => {
  const input = [
    { name: 'Novo' },
    { name: 'Segundo', sort_order: 1 },
    { name: 'Primeiro', sort_order: 0 },
  ];
  expect(sortCatalog(input).map((item) => item.name)).toEqual([
    'Primeiro',
    'Segundo',
    'Novo',
  ]);
  expect(input[0].name).toBe('Novo');
});
it('moves in both directions and ignores out of bounds positions', () => {
  expect(moveCatalogItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  expect(moveCatalogItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  expect(moveCatalogItem(['a'], 0, -1)).toEqual(['a']);
});

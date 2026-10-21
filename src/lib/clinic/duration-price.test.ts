import { expect, it } from 'vitest';
import { proportionalSessionPrice } from './duration-price';
it('scales catalogue price for longer, shorter and standard sessions', () => {
  expect(proportionalSessionPrice(45, 50, 80)).toBe(72);
  expect(proportionalSessionPrice(45, 50, 60)).toBe(54);
  expect(proportionalSessionPrice(45, 50, 25)).toBe(22.5);
  expect(proportionalSessionPrice(45, 50, 50)).toBe(45);
});
it('rounds to cents without changing free services or dividing by an invalid duration', () => {
  expect(proportionalSessionPrice(35, 60, 50)).toBe(29.17);
  expect(proportionalSessionPrice(0, 50, 80)).toBe(0);
  expect(proportionalSessionPrice(45, 0, 80)).toBe(45);
});

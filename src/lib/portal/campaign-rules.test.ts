import { expect, it } from 'vitest';
import { campaignAmounts, campaignVisible } from './campaign-rules';
it('hides promotions for any positive balance, while exchange campaigns remain visible', () => {
  expect(campaignVisible('promotional', 0.01)).toBe(false);
  expect(campaignVisible('promotional', 0)).toBe(true);
  expect(campaignVisible('exchange', 30)).toBe(true);
  expect(() => campaignAmounts(59, 20, 'promotional')).toThrow('promocionais');
});
it.each([
  [59, 20, 20, 39],
  [59, 100, 59, 0],
  [59, 0, 0, 59],
  [10.03, 0.02, 0.02, 10.01],
])('uses cents for %s price and %s wallet', (price, balance, wallet, due) => {
  expect(campaignAmounts(price, balance, 'exchange')).toEqual({
    total: price,
    wallet,
    due,
  });
});
it.each([NaN, Infinity, 0, -1])('rejects an invalid price: %s', (price) =>
  expect(() => campaignAmounts(price, 0, 'exchange')).toThrow()
);
it('rejects unknown campaign types or an unknown balance', () => {
  expect(() => campaignAmounts(59, 0, 'other')).toThrow();
  expect(() => campaignAmounts(59, NaN, 'exchange')).toThrow();
});

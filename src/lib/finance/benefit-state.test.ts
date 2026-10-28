import { expect, it } from 'vitest';
import { benefitState } from './benefit-state';
const now = Date.parse('2026-10-28T12:00:00Z');
it('does not label a fully consumed benefit as active', () =>
  expect(benefitState('active', '2026-12-01', 0, now)).toBe('used'));
it('identifies expired benefits with remaining sessions', () =>
  expect(benefitState('active', '2026-10-01', 2, now)).toBe('expired'));
it('preserves cancellation and payment states regardless of balance', () => {
  expect(benefitState('refunded', null, 0, now)).toBe('refunded');
  expect(benefitState('pending_payment', null, 2, now)).toBe('pending_payment');
});
it('identifies available benefits without an expiry date', () =>
  expect(benefitState('active', null, 2, now)).toBe('available'));

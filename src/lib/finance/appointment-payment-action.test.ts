import { expect, it } from 'vitest';
import { appointmentPaymentAction } from './appointment-payment-action';
const base = {
  cancelled: false,
  paid: false,
  benefitType: 'direct' as const,
  outstanding: 45,
};
it.each(['voucher', 'pack'] as const)(
  'keeps a reserved %s usable even with no cash outstanding',
  (benefitType) => {
    const action = appointmentPaymentAction({
      ...base,
      benefitType,
      benefitStatus: 'reserved',
      outstanding: 0,
    });
    expect(action.disabled).toBe(false);
    expect(action.kind).toBe('benefit');
    expect(action.label).toContain('Utilizar');
  }
);
it.each(['voucher', 'pack'] as const)(
  'blocks a second use of a consumed %s',
  (benefitType) => {
    expect(
      appointmentPaymentAction({
        ...base,
        benefitType,
        benefitStatus: 'consumed',
      }).disabled
    ).toBe(true);
  }
);
it.each([{ paid: true }, { hasPaidSale: true }, { cancelled: true }])(
  'never enables collection for paid or cancelled sessions',
  (state) => {
    expect(appointmentPaymentAction({ ...base, ...state }).disabled).toBe(true);
  }
);
it('does not call a free appointment paid merely because it has no cash balance', () => {
  const action = appointmentPaymentAction({ ...base, outstanding: 0 });
  expect(action.disabled).toBe(true);
  expect(action.label).not.toContain('Pago');
});
it('keeps the normal collection action for outstanding cash sessions', () => {
  expect(appointmentPaymentAction(base)).toEqual({
    label: 'Receber',
    disabled: false,
    kind: 'cash',
  });
});

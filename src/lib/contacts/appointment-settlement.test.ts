import { describe, expect, it } from 'vitest';
import {
  appointmentSettlementTags,
  type SettlementAppointment,
} from './appointment-settlement';

const base: SettlementAppointment = {
  price: 45,
  currency: 'EUR',
  status: 'completed',
};
describe('Client 360 appointment settlement', () => {
  it('shows cash only from a confirmed payment', () => {
    expect(
      appointmentSettlementTags({
        ...base,
        sales: [
          {
            status: 'paid',
            paid_amount: 45,
            balance_due: 0,
            payments: [{ status: 'confirmed', method: 'cash', amount: 45 }],
          },
        ],
      })
    ).toEqual([{ label: 'Pago · Dinheiro', tone: 'paid' }]);
  });
  it('does not infer cash from a legacy paid marker', () => {
    expect(
      appointmentSettlementTags({ ...base, paid_at: '2026-10-31T12:00:00Z' })
    ).toEqual([{ label: 'Pago · meio não registado', tone: 'paid' }]);
  });
  it('keeps reserved vouchers actionable instead of claiming they were redeemed', () => {
    expect(
      appointmentSettlementTags({
        ...base,
        benefits: [
          {
            benefit_type: 'voucher',
            status: 'reserved',
            voucher: { code: 'EXAMPLE' },
          },
        ],
      })
    ).toEqual([
      {
        label: 'Voucher reservado · falta utilizar · EXAMPLE',
        tone: 'pending',
      },
    ]);
  });
  it('shows consumed packs without a cash debt', () => {
    expect(
      appointmentSettlementTags({
        ...base,
        benefits: [
          {
            benefit_type: 'pack',
            status: 'consumed',
            client_pack: { code: 'PACK-TEST' },
          },
        ],
      })
    ).toEqual([{ label: 'Pack utilizado · PACK-TEST', tone: 'benefit' }]);
  });
  it('ignores released benefits', () => {
    expect(
      appointmentSettlementTags({
        ...base,
        benefits: [{ benefit_type: 'voucher', status: 'released' }],
      })
    ).toEqual([{ label: 'Pagamento pendente', tone: 'pending' }]);
  });
  it('shows partial payments and remaining debt even when paid_at exists', () => {
    const tags = appointmentSettlementTags({
      ...base,
      paid_at: '2026-10-31T12:00:00Z',
      sales: [
        {
          status: 'partially_paid',
          paid_amount: 20,
          balance_due: 25,
          payments: [
            { status: 'confirmed', method: 'mb_way', amount: 20 },
            { status: 'pending', method: 'cash', amount: 25 },
          ],
        },
      ],
    });
    expect(tags[0].label).toBe('Pagamento parcial · MB WAY');
    expect(tags[1].label).toContain('25');
    expect(tags[1].tone).toBe('pending');
  });
  it('does not use refunded payment methods as a current receipt', () => {
    expect(
      appointmentSettlementTags({
        ...base,
        paid_at: '2026-10-31T12:00:00Z',
        sales: [
          {
            status: 'refunded',
            paid_amount: 45,
            balance_due: 0,
            payments: [{ status: 'refunded', method: 'cash', amount: 45 }],
          },
        ],
      })
    ).toEqual([{ label: 'Pagamento reembolsado', tone: 'neutral' }]);
  });
  it('shows multiple confirmed methods without duplicates', () => {
    const tags = appointmentSettlementTags({
      ...base,
      sales: [
        {
          status: 'paid',
          paid_amount: 45,
          balance_due: 0,
          payments: [
            { status: 'confirmed', method: 'card', amount: 20 },
            { status: 'confirmed', method: 'cash', amount: 20 },
            { status: 'confirmed', method: 'cash', amount: 5 },
          ],
        },
      ],
    });
    expect(tags[0].label).toBe('Pago · Cartão + Dinheiro');
  });
  it('does not turn a cancelled unpaid session into a collection alert', () => {
    expect(appointmentSettlementTags({ ...base, status: 'cancelled' })).toEqual(
      [{ label: 'Sem pagamento registado', tone: 'neutral' }]
    );
  });
});

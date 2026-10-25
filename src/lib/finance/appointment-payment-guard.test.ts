import { expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { assertAppointmentCollectible } from './appointment-payment-guard';
it('locks and scopes the appointment before accepting a new sale', async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([
      [{ id: 'appointment', paid_at: null, status: 'completed' }],
    ])
    .mockResolvedValue([[]]);
  await expect(
    assertAppointmentCollectible(
      { execute } as unknown as PoolConnection,
      'account',
      'appointment'
    )
  ).resolves.toBeUndefined();
  expect(execute.mock.calls[0][1]).toEqual(['appointment', 'account']);
  expect(execute.mock.calls[0][0]).toContain('FOR UPDATE');
});
it.each([
  { paid_at: '2026-10-25', status: 'completed' },
  { paid_at: null, status: 'cancelled' },
])('refuses paid or cancelled appointments', async (row) => {
  const execute = vi.fn().mockResolvedValue([[row]]);
  await expect(
    assertAppointmentCollectible(
      { execute } as unknown as PoolConnection,
      'account',
      'appointment'
    )
  ).rejects.toThrow();
  expect(execute).toHaveBeenCalledOnce();
});
it.each([true, false])(
  'refuses already settled sales or consumed benefits even without paid_at',
  async (sale) => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [{ id: 'appointment', paid_at: null, status: 'confirmed' }],
      ])
      .mockResolvedValueOnce([sale ? [{ id: 'sale' }] : []])
      .mockResolvedValueOnce([sale ? [] : [{ id: 'benefit' }]]);
    await expect(
      assertAppointmentCollectible(
        { execute } as unknown as PoolConnection,
        'account',
        'appointment'
      )
    ).rejects.toThrow('liquidada');
  }
);

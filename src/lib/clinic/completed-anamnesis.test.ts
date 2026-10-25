import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue({ affectedRows: 1 }),
}));
vi.mock('@/lib/mysql/db', () => ({ mutate: mocks.mutate }));
import {
  revokeCompletedAnamnesis,
  isCompletedPendingAnamnesis,
} from './completed-anamnesis';
it('only revokes pending forms belonging to completed appointments in the account', async () => {
  await revokeCompletedAnamnesis('account');
  expect(mocks.mutate).toHaveBeenCalledWith(
    expect.stringContaining("f.status='pending' AND a.status='completed'"),
    ['account']
  );
  expect(mocks.mutate.mock.calls[0][0]).toContain('a.account_id=f.account_id');
});
it('preserves submitted and reviewed histories, including array relationships', () => {
  expect(
    isCompletedPendingAnamnesis({
      status: 'pending',
      appointment: { status: 'completed' },
    })
  ).toBe(true);
  expect(
    isCompletedPendingAnamnesis({
      status: 'pending',
      appointment: [{ status: 'completed' }],
    })
  ).toBe(true);
  for (const status of ['submitted', 'reviewed', 'revoked'])
    expect(
      isCompletedPendingAnamnesis({
        status,
        appointment: { status: 'completed' },
      })
    ).toBe(false);
  expect(
    isCompletedPendingAnamnesis({
      status: 'pending',
      appointment: { status: 'confirmed' },
    })
  ).toBe(false);
});

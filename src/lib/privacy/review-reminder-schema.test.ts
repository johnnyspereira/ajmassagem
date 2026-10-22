import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ select: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.select,
  mutate: mocks.mutate,
}));
beforeEach(() => {
  vi.resetModules();
  mocks.select.mockReset();
  mocks.mutate.mockReset();
  mocks.mutate.mockResolvedValue({});
});
it('installs missing additive schema once without enabling the automatic sender', async () => {
  mocks.select.mockResolvedValue([]);
  const { ensurePrivacyReminderSchema } =
    await import('./review-reminder-schema');
  await Promise.all([
    ensurePrivacyReminderSchema(),
    ensurePrivacyReminderSchema(),
  ]);
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
  expect(mocks.mutate.mock.calls[0][0]).toContain('DEFAULT FALSE');
  expect(mocks.mutate.mock.calls[1][0]).toContain(
    'CREATE TABLE IF NOT EXISTS privacy_review_reminders'
  );
});
it('does not require DDL permissions when the schema is already installed', async () => {
  mocks.select.mockResolvedValue([{ present: true }]);
  const { ensurePrivacyReminderSchema } =
    await import('./review-reminder-schema');
  await ensurePrivacyReminderSchema();
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it('allows a retry after installation fails instead of caching the failure', async () => {
  mocks.select
    .mockRejectedValueOnce({ code: 'ER_TABLEACCESS_DENIED_ERROR' })
    .mockResolvedValue([{ present: true }]);
  const { ensurePrivacyReminderSchema } =
    await import('./review-reminder-schema');
  await expect(ensurePrivacyReminderSchema()).rejects.toEqual({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
  });
  await expect(ensurePrivacyReminderSchema()).resolves.toBeUndefined();
});
it('reports database permission failures without exposing server details', async () => {
  const { privacyReminderError } = await import('./review-reminder-schema');
  const response = privacyReminderError({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
    message: 'private database details',
  })!;
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe('DATABASE_PERMISSION_DENIED');
  expect(body.error).not.toContain('private database details');
});

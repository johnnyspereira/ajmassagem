import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/mysql/db', () => ({
  selectRows: mocks.rows,
  mutate: mocks.mutate,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue([]);
  mocks.mutate.mockResolvedValue({});
});

it('prepares all four columns once, sharing concurrent requests', async () => {
  const { ensureReviewLinkSchema } = await import('./review-link-schema');
  await Promise.all([ensureReviewLinkSchema(), ensureReviewLinkSchema()]);
  await ensureReviewLinkSchema();
  expect(mocks.rows).toHaveBeenCalledOnce();
  expect(mocks.mutate).toHaveBeenCalledTimes(4);
  expect(mocks.mutate.mock.calls.map(([sql]) => sql)).toEqual([
    "ALTER TABLE clinic_communication_settings ADD COLUMN review_link_mode ENUM('system','google') NOT NULL DEFAULT 'system'",
    'ALTER TABLE clinic_communication_settings ADD COLUMN review_google_url TEXT NULL',
    'ALTER TABLE clinic_appointment_reviews ADD COLUMN sent_link_mode VARCHAR(16) NULL',
    'ALTER TABLE clinic_appointment_reviews ADD COLUMN sent_link_url TEXT NULL',
  ]);
});

it('repairs a partially applied migration without altering existing settings', async () => {
  mocks.rows.mockResolvedValue([
    {
      TABLE_NAME: 'clinic_communication_settings',
      COLUMN_NAME: 'review_link_mode',
    },
    { TABLE_NAME: 'clinic_appointment_reviews', COLUMN_NAME: 'sent_link_mode' },
  ]);
  const { ensureReviewLinkSchema } = await import('./review-link-schema');
  await ensureReviewLinkSchema();
  expect(mocks.mutate.mock.calls.map(([sql]) => sql)).toEqual([
    'ALTER TABLE clinic_communication_settings ADD COLUMN review_google_url TEXT NULL',
    'ALTER TABLE clinic_appointment_reviews ADD COLUMN sent_link_url TEXT NULL',
  ]);
});

it('does not require ALTER when migration 057 is already complete', async () => {
  mocks.rows.mockResolvedValue([
    ...['review_link_mode', 'review_google_url'].map((COLUMN_NAME) => ({
      TABLE_NAME: 'clinic_communication_settings',
      COLUMN_NAME,
    })),
    ...['sent_link_mode', 'sent_link_url'].map((COLUMN_NAME) => ({
      TABLE_NAME: 'clinic_appointment_reviews',
      COLUMN_NAME,
    })),
  ]);
  const { ensureReviewLinkSchema } = await import('./review-link-schema');
  await ensureReviewLinkSchema();
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it('retries after failure and tolerates another process adding a column', async () => {
  mocks.mutate.mockRejectedValueOnce({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
  const { ensureReviewLinkSchema } = await import('./review-link-schema');
  await expect(ensureReviewLinkSchema()).rejects.toMatchObject({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
  });
  mocks.mutate.mockRejectedValueOnce({ code: 'ER_DUP_FIELDNAME' });
  await expect(ensureReviewLinkSchema()).resolves.toBeUndefined();
  expect(mocks.rows).toHaveBeenCalledTimes(2);
});

it('gives sanitized actionable diagnostics without exposing SQL or credentials', async () => {
  const { reviewLinkSchemaError } = await import('./review-link-schema');
  const response = reviewLinkSchemaError({
    code: 'ER_TABLEACCESS_DENIED_ERROR',
    message: 'private connection details',
  });
  expect(response?.status).toBe(503);
  const body = await response!.json();
  expect(body.error).toContain('ALTER');
  expect(body.error).not.toContain('private');
  expect(reviewLinkSchemaError({ code: 'ER_NO_SUCH_TABLE' })?.status).toBe(503);
  expect(reviewLinkSchemaError(new Error('other'))).toBeNull();
});

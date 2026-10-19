import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  role: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.account,
  requireRole: mocks.role,
  toErrorResponse: (error: { status?: number }) =>
    Response.json({ error: 'Denied' }, { status: error.status || 500 }),
}));
vi.mock('@/lib/mysql/db', () => ({
  db: () => ({ execute: mocks.execute }),
  transaction: mocks.transaction,
}));
import { GET, POST, PATCH, PUT } from './route';
import { DEFAULT_LEAD_SETTINGS } from '@/lib/contacts/lead-workflow';
const req = (method: string, body?: unknown, query = '') =>
  new Request('https://crm.test/api/leads/workflow' + query, {
    method,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
beforeEach(() => {
  mocks.account.mockResolvedValue({ accountId: 'account-a', userId: 'actor' });
  mocks.role.mockResolvedValue({ accountId: 'account-a', userId: 'actor' });
  mocks.execute.mockImplementation(async (sql: string) =>
    sql.startsWith('SELECT id FROM contacts')
      ? [[{ id: 'contact' }]]
      : sql.startsWith('SELECT id FROM conversations')
        ? [[{ id: 'conversation' }]]
        : sql.startsWith('SELECT contact_id')
          ? [[{ contact_id: 'contact', status: 'contacted' }]]
          : sql.startsWith('SELECT')
            ? [[]]
            : [{ affectedRows: 1 }]
  );
  mocks.transaction.mockImplementation(async (work) =>
    work({ execute: mocks.execute })
  );
});
describe('Lead workflow API', () => {
  it('explains a pending schema installation without exposing SQL details', async () => {
    mocks.execute.mockRejectedValue({
      code: 'ER_NO_SUCH_TABLE',
      message: 'private SQL',
    });
    const response = await POST(
      req('POST', { action: 'load', contactIds: ['contact'] })
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('Reinicie a aplicação no cPanel');
    expect(body.error).not.toContain('private SQL');
  });
  it('scopes reads to the authenticated account and returns persisted settings or defaults', async () => {
    const response = await POST(
      req('POST', {
        action: 'load',
        accountId: 'forged',
        contactIds: ['contact'],
      })
    );
    expect((await response.json()).settings).toEqual(DEFAULT_LEAD_SETTINGS);
    expect(mocks.execute.mock.calls[0][1]).toEqual(['account-a', 'contact']);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('requires administrator role for shared messages and validates all settings', async () => {
    expect(
      (await PUT(req('PUT', { ...DEFAULT_LEAD_SETTINGS, recoveryDays: 0 })))
        .status
    ).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect((await PUT(req('PUT', DEFAULT_LEAD_SETTINGS))).status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith('admin');
    expect(mocks.execute.mock.calls[0][1][0]).toBe('account-a');
  });
  it('denies operational changes to viewers before any SQL write', async () => {
    mocks.role.mockRejectedValue({ status: 403 });
    expect((await PATCH(req('PATCH', {}))).status).toBe(403);
    expect(
      (
        await POST(
          req('POST', { action: 'prepare-chat', contactId: 'contact' })
        )
      ).status
    ).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('checks contact ownership before reading history or preparing a conversation', async () => {
    mocks.execute.mockResolvedValue([[]]);
    expect(
      (await GET(req('GET', undefined, '?contactId=other-account-contact')))
        .status
    ).toBe(404);
    expect(
      (
        await POST(
          req('POST', {
            action: 'prepare-chat',
            contactId: 'other-account-contact',
          })
        )
      ).status
    ).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('prepares a conversation without inserting or sending messages', async () => {
    const response = await POST(
      req('POST', { action: 'prepare-chat', contactId: 'contact' })
    );
    expect(await response.json()).toEqual({ conversationId: 'conversation' });
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.includes('ON DUPLICATE KEY UPDATE id=id')
      )
    ).toBe(true);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        /INSERT INTO messages|UPDATE lead_followups/.test(sql)
      )
    ).toBe(false);
  });
  it('records an explicit approach atomically and clears terminal follow-up dates', async () => {
    const response = await PATCH(
      req('PATCH', {
        contactId: 'contact',
        status: 'not_interested',
        nextFollowupAt: '2026-10-25T12:00:00Z',
        notes: 'Não pretende agendar.',
        contacted: true,
      })
    );
    expect(response.status).toBe(200);
    const update = mocks.execute.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO lead_followups')
    );
    expect(update?.[1].slice(0, 5)).toEqual([
      'account-a',
      'contact',
      'not_interested',
      null,
      true,
    ]);
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO lead_followup_activities')
      )
    ).toBe(true);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid status, date and oversized notes before SQL', async () => {
    for (const invalid of [
      { status: '__proto__' },
      { nextFollowupAt: 'invalid' },
      { notes: 'x'.repeat(3001) },
    ])
      expect(
        (
          await PATCH(
            req('PATCH', {
              contactId: 'contact',
              status: 'new',
              nextFollowupAt: null,
              notes: '',
              contacted: false,
              ...invalid,
            })
          )
        ).status
      ).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

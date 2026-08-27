import { describe, expect, it } from 'vitest';

import { compileQuery } from './query-compiler';

const context = { accountId: 'account-1', userId: 'user-1' };

describe('MySQL query compiler', () => {
  it('always scopes direct table reads to the authenticated account', () => {
    const query = compileQuery(
      {
        table: 'contacts',
        operation: 'select',
        columns: 'id, name',
        filters: [{ column: 'phone', operator: 'eq', value: '351900000000' }],
      },
      context
    );

    expect(query.sql).toContain('`account_id` = ?');
    expect(query.sql).toContain('`phone` = ?');
    expect(query.values).toEqual(['account-1', '351900000000']);
  });

  it('scopes child tables through their account-owned parent', () => {
    const query = compileQuery(
      { table: 'messages', operation: 'select', columns: '*' },
      context
    );

    expect(query.sql).toContain('EXISTS (SELECT 1 FROM `conversations`');
    expect(query.sql).toContain('`tenant_conversations`.`account_id` = ?');
    expect(query.values).toEqual(['account-1']);
  });

  it('overrides account and author identifiers on inserts', () => {
    const query = compileQuery(
      {
        table: 'contacts',
        operation: 'insert',
        values: {
          account_id: 'attacker-account',
          user_id: 'attacker-user',
          phone: '351900000000',
        },
      },
      context
    );

    expect(query.values).toContain('account-1');
    expect(query.values).toContain('user-1');
    expect(query.values).not.toContain('attacker-account');
    expect(query.values).not.toContain('attacker-user');
    expect(query.insertedIds).toHaveLength(1);
  });

  it('rejects identifier injection', () => {
    expect(() =>
      compileQuery(
        { table: 'contacts; DROP TABLE contacts', operation: 'select' },
        context
      )
    ).toThrow('Invalid identifier');
  });

  it('selects base rows for relationship hydration', () => {
    const query = compileQuery(
      {
        table: 'conversations',
        operation: 'select',
        columns: '*, contact:contacts(*)',
      },
      context
    );
    expect(query.sql).toContain('SELECT * FROM `conversations`');
  });
});

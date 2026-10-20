import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  createLeadSchemaInstaller,
  LeadSchemaInstallError,
} from './lead-schema';
const migration = () =>
  readFile('mysql/migrations/051_lead_followup_workflow.sql', 'utf8');
const tables = [
  'lead_workflow_settings',
  'lead_followups',
  'lead_followup_activities',
];
function harness(initial: string[] = []) {
  const existing = new Set(initial);
  let deny = false;
  const query = vi.fn(
    async (sql: string): Promise<Record<string, unknown>[]> => {
      if (sql.includes('information_schema.TABLES'))
        return [...existing].map((name) => ({ name }));
      if (sql.includes('information_schema.COLUMNS'))
        return ['accounts', 'contacts', 'app_users'].map((parent) => ({
          parent,
          type: 'char(36)',
          charset: parent === 'contacts' ? 'latin1' : 'utf8mb4',
          collation:
            parent === 'contacts' ? 'latin1_swedish_ci' : 'utf8mb4_general_ci',
        }));
      if (sql.startsWith('CREATE TABLE')) {
        const table = tables.find((name) =>
          sql.startsWith(`CREATE TABLE IF NOT EXISTS ${name} (`)
        );
        if (deny && table === 'lead_followups')
          throw { code: 'ER_TABLEACCESS_DENIED_ERROR' };
        if (table) existing.add(table);
        return [];
      }
      throw new Error('Unexpected query');
    }
  );
  return {
    query,
    existing,
    setDenied: (value: boolean) => {
      deny = value;
    },
  };
}
describe('Lead schema installation', () => {
  it('leaves an installed schema untouched and coalesces simultaneous requests', async () => {
    const h = harness(tables);
    const read = vi.fn(migration);
    const ensure = createLeadSchemaInstaller(h.query, read);
    await Promise.all(Array.from({ length: 8 }, () => ensure()));
    await ensure();
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });
  it('installs only the three additive tables and matches legacy FK collations', async () => {
    const h = harness();
    const ensure = createLeadSchemaInstaller(h.query, migration);
    await ensure();
    const creates = h.query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.startsWith('CREATE'));
    expect(creates).toHaveLength(3);
    expect(creates.join('\n')).toContain(
      'account_id char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'
    );
    expect(creates.join('\n')).toContain(
      'contact_id char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci'
    );
    expect(
      creates.every(
        (sql) =>
          !/\b(?:DROP|DELETE|ALTER|UPDATE)\s+(?:TABLE|contacts|accounts)/i.test(
            sql
          )
      )
    ).toBe(true);
    expect([...h.existing]).toEqual(tables);
  });
  it('can resume a partial installation after privileges are corrected', async () => {
    const h = harness();
    h.setDenied(true);
    const ensure = createLeadSchemaInstaller(h.query, migration);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(ensure()).rejects.toEqual(new LeadSchemaInstallError(true));
      expect([...h.existing]).toEqual(['lead_workflow_settings']);
      h.setDenied(false);
      await ensure();
      expect([...h.existing]).toEqual(tables);
    } finally {
      log.mockRestore();
    }
  });
  it('does not execute a migration containing unrelated or destructive statements', async () => {
    const h = harness();
    const ensure = createLeadSchemaInstaller(
      h.query,
      async () => 'DROP TABLE contacts;'
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(ensure()).rejects.toBeInstanceOf(LeadSchemaInstallError);
      expect(h.query.mock.calls.some(([sql]) => sql.startsWith('DROP'))).toBe(
        false
      );
    } finally {
      log.mockRestore();
    }
  });
});

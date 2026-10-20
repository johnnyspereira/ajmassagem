import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket, type Connection } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createLeadSchemaInstaller,
  LeadSchemaInstallError,
} from './lead-schema';
import { DEFAULT_LEAD_SETTINGS } from './lead-workflow';

const url = process.env.LEAD_SCHEMA_TEST_URL;
describe.skipIf(!url)('Lead schema on MariaDB', () => {
  let connection: Connection;
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.pathname !== '/crm_leads_ci'
    )
      throw new Error(
        'Schema integration tests require the isolated local CI database.'
      );
    connection = await mysql.createConnection(url!);
    await connection.query(
      'CREATE TABLE accounts(id CHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );
    await connection.query(
      'CREATE TABLE contacts(id CHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci'
    );
    await connection.query(
      'CREATE TABLE app_users(id CHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
  });
  afterAll(async () => {
    await connection?.end();
  });
  it('resumes partial DDL, preserves saved data and enforces FKs across legacy collations', async () => {
    let interrupted = true;
    const query = async (sql: string) => {
      if (
        interrupted &&
        sql.startsWith('CREATE TABLE IF NOT EXISTS lead_followups (')
      )
        throw new Error('Simulated interrupted deployment');
      const [rows] = await connection.query<RowDataPacket[]>(sql);
      return Array.isArray(rows) ? rows : [];
    };
    const ensure = createLeadSchemaInstaller(query, () =>
      readFile('mysql/migrations/051_lead_followup_workflow.sql', 'utf8')
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(ensure()).rejects.toBeInstanceOf(LeadSchemaInstallError);
    } finally {
      log.mockRestore();
    }
    interrupted = false;
    await ensure();
    await connection.execute('INSERT INTO accounts(id) VALUES(?)', [
      'account-ci',
    ]);
    await connection.execute('INSERT INTO contacts(id) VALUES(?)', [
      'contact-ci',
    ]);
    await connection.execute('INSERT INTO app_users(id) VALUES(?)', [
      'actor-ci',
    ]);
    await connection.execute(
      'INSERT INTO lead_workflow_settings(account_id,templates,updated_by) VALUES(?,?,?)',
      [
        'account-ci',
        JSON.stringify(DEFAULT_LEAD_SETTINGS.templates),
        'actor-ci',
      ]
    );
    await connection.execute(
      'INSERT INTO lead_followups(account_id,contact_id,status,notes,updated_by) VALUES(?,?,?,?,?)',
      [
        'account-ci',
        'contact-ci',
        'interested',
        'Próxima sessão combinada',
        'actor-ci',
      ]
    );
    await connection.execute(
      'INSERT INTO lead_followup_activities(id,account_id,contact_id,actor_user_id,status,contacted) VALUES(?,?,?,?,?,?)',
      [
        'activity-ci',
        'account-ci',
        'contact-ci',
        'actor-ci',
        'interested',
        true,
      ]
    );
    await ensure();
    const [saved] = await connection.execute<RowDataPacket[]>(
      'SELECT notes,status FROM lead_followups WHERE account_id=? AND contact_id=?',
      ['account-ci', 'contact-ci']
    );
    expect(saved[0]).toMatchObject({
      notes: 'Próxima sessão combinada',
      status: 'interested',
    });
    await connection.execute('DELETE FROM contacts WHERE id=?', ['contact-ci']);
    const [remaining] = await connection.query<RowDataPacket[]>(
      'SELECT (SELECT COUNT(*) FROM lead_followups) AS followups, (SELECT COUNT(*) FROM lead_followup_activities) AS activities'
    );
    expect(remaining[0]).toMatchObject({ followups: 0, activities: 0 });
  });
});

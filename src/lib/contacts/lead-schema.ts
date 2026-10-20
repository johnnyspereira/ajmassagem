import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RowDataPacket } from 'mysql2';
import { db } from '@/lib/mysql/db';

const TABLES = [
  'lead_workflow_settings',
  'lead_followups',
  'lead_followup_activities',
];
type Query = (sql: string) => Promise<Record<string, unknown>[]>;
export class LeadSchemaInstallError extends Error {
  constructor(public readonly permissionDenied: boolean) {
    super('Lead schema installation failed');
  }
}
/** Install only the additive Leads tables, independently of older unrelated migrations. */
export function createLeadSchemaInstaller(
  query: Query,
  readSql: () => Promise<string>
) {
  let ready: Promise<void> | null = null;
  async function install() {
    const existing = await query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('lead_workflow_settings','lead_followups','lead_followup_activities')"
    );
    if (TABLES.every((table) => existing.some((row) => row.name === table)))
      return;
    const columns = await query(
      "SELECT TABLE_NAME AS parent, COLUMN_TYPE AS type, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='id' AND TABLE_NAME IN ('accounts','contacts','app_users')"
    );
    const references: Record<string, string> = {};
    for (const parent of ['accounts', 'contacts', 'app_users']) {
      const column = columns.find((row) => row.parent === parent);
      if (
        !column ||
        typeof column.type !== 'string' ||
        !/^(?:char|varchar)\(\d{1,3}\)$/i.test(column.type) ||
        typeof column.charset !== 'string' ||
        !/^[a-zA-Z0-9_]+$/.test(column.charset) ||
        typeof column.collation !== 'string' ||
        !/^[a-zA-Z0-9_]+$/.test(column.collation)
      )
        throw new Error('Unsupported parent identifier definition');
      references[parent] =
        `${column.type} CHARACTER SET ${column.charset} COLLATE ${column.collation}`;
    }
    // Match legacy parent-ID collations without altering existing data or tables.
    const sql = (await readSql())
      .replace(/\b(account_id) CHAR\(36\)/g, `$1 ${references.accounts}`)
      .replace(/\b(contact_id) CHAR\(36\)/g, `$1 ${references.contacts}`)
      .replace(
        /\b(updated_by|actor_user_id) CHAR\(36\)/g,
        `$1 ${references.app_users}`
      );
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    if (
      statements.length !== TABLES.length ||
      statements.some(
        (statement) =>
          !TABLES.some((table) =>
            statement.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`)
          )
      )
    )
      throw new Error('Unexpected lead schema statements');
    for (const statement of statements) await query(statement);
    const installed = await query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('lead_workflow_settings','lead_followups','lead_followup_activities')"
    );
    if (!TABLES.every((table) => installed.some((row) => row.name === table)))
      throw new Error('Lead tables were not created');
  }
  return async function ensureLeadSchema() {
    if (!ready)
      ready = install().catch((error) => {
        ready = null;
        const code =
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'SCHEMA_INITIALIZATION_FAILED';
        console.error('[leads] Schema initialization failed:', code);
        throw new LeadSchemaInstallError(
          [
            'ER_ACCESS_DENIED_ERROR',
            'ER_DBACCESS_DENIED_ERROR',
            'ER_TABLEACCESS_DENIED_ERROR',
          ].includes(code)
        );
      });
    return ready;
  };
}
export const ensureLeadSchema = createLeadSchemaInstaller(
  async (sql) => {
    const [rows] = await db().query<RowDataPacket[]>(sql);
    return Array.isArray(rows) ? rows : [];
  },
  () =>
    readFile(
      path.join(
        process.cwd(),
        'mysql/migrations/051_lead_followup_workflow.sql'
      ),
      'utf8'
    )
);

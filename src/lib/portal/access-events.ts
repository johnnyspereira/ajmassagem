import { randomUUID } from 'node:crypto';
import { mutate } from '@/lib/mysql/db';
import { ensurePortalStoreSchema } from './store-schema';
export async function recordAccess(input: {
  accountId: string;
  contactId?: string;
  userId?: string;
  scope: 'portal' | 'campaign' | 'crm';
  resource: string;
}) {
  await ensurePortalStoreSchema();
  if (!input.contactId && !input.userId)
    throw new Error('Acesso sem identidade.');
  await mutate(
    `INSERT IGNORE INTO crm_access_events
    (id,account_id,actor_key,contact_id,user_id,scope,resource_id,time_bucket) VALUES(?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      input.accountId,
      input.contactId ? `portal:${input.contactId}` : `staff:${input.userId}`,
      input.contactId || null,
      input.userId || null,
      input.scope,
      input.resource.slice(0, 80),
      Math.floor(Date.now() / 300000),
    ]
  );
}

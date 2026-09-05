import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';
import { notifyAccountEvent } from '@/lib/notifications/account-events';

async function authorized(
  request: Request,
  accountId: string,
  bodySecret?: unknown
) {
  // Bracket access is intentional: this value only exists in Passenger's
  // runtime environment and must never be folded into the GitHub build.
  const secret = process.env['WHATSAPP_WORKER_SECRET']?.trim();
  // Some shared-hosting proxy configurations do not forward the standard
  // Authorization header to Passenger. Keep Bearer support, but accept the
  // worker-specific header as a resilient authenticated transport too.
  const supplied =
    request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() ??
    request.headers.get('x-whatsapp-worker-secret')?.trim() ??
    (typeof bodySecret === 'string' ? bodySecret.trim() : undefined);
  if (!supplied) return false;
  if (secret) {
    const left = Buffer.from(secret);
    const right = Buffer.from(supplied);
    if (left.length === right.length && timingSafeEqual(left, right)) return true;
  }
  if (!accountId) return false;
  const rows = await selectRows<(RowDataPacket & { secret_hash: string })[]>(
    'SELECT secret_hash FROM whatsapp_worker_credentials WHERE account_id=? LIMIT 1',
    [accountId]
  );
  const expected = rows[0]?.secret_hash;
  if (!expected) return false;
  const suppliedHash = createHash('sha256').update(supplied).digest('hex');
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(suppliedHash, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function phone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function phoneKey(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function messageDedupeKey(conversationId: string, externalId: string) {
  return createHash('sha256')
    .update(`${conversationId}:${externalId}`)
    .digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const accountId = String(body.accountId ?? '');
    if (!accountId) throw new Error('accountId is required.');
    if (!(await authorized(request, accountId, body.workerSecret)))
      return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (action === 'heartbeat') {
      await mutate(
        `INSERT INTO whatsapp_worker_health(
          account_id,worker_id,connected,state,qr,user_jid,has_saved_auth,
          connected_at,last_activity_at,last_error,last_seen_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id),connected=VALUES(connected),
          state=VALUES(state),qr=VALUES(qr),user_jid=VALUES(user_jid),
          has_saved_auth=VALUES(has_saved_auth),connected_at=VALUES(connected_at),
          last_activity_at=VALUES(last_activity_at),last_error=VALUES(last_error),
          last_seen_at=UTC_TIMESTAMP(3)`,
        [
          accountId,
          String(body.workerId ?? 'local-worker'),
          body.connected ? 1 : 0,
          String(body.state ?? 'offline').slice(0, 32),
          body.qr ? String(body.qr) : null,
          body.userJid ? String(body.userJid) : null,
          body.hasSavedAuth ? 1 : 0,
          body.connectedAt ? new Date(String(body.connectedAt)) : null,
          body.lastActivityAt ? new Date(String(body.lastActivityAt)) : null,
          body.lastError ? String(body.lastError) : null,
        ]
      );
      return Response.json({ success: true });
    }

    if (action === 'claim_command') {
      const workerId = String(body.workerId ?? 'local-worker').slice(0, 100);
      const command = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            command_type: string;
            payload: string | Record<string, unknown> | null;
          })[]
        >(
          `SELECT id,command_type,payload FROM whatsapp_worker_commands
           WHERE account_id=? AND status='pending'
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [accountId]
        );
        const row = rows[0];
        if (!row) return null;
        await connection.execute(
          `UPDATE whatsapp_worker_commands SET status='processing',worker_id=?,
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [workerId, row.id]
        );
        return {
          ...row,
          payload:
            typeof row.payload === 'string'
              ? JSON.parse(row.payload)
              : row.payload,
        };
      });
      return Response.json({ command });
    }

    if (action === 'complete_command') {
      const failed = Boolean(body.error);
      await mutate(
        `UPDATE whatsapp_worker_commands SET status=?,last_error=?,
         completed_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3)
         WHERE id=? AND account_id=?`,
        [
          failed ? 'failed' : 'done',
          failed ? String(body.error) : null,
          String(body.commandId),
          accountId,
        ]
      );
      return Response.json({ success: true });
    }

    if (action === 'claim_outbox') {
      const workerId = String(body.workerId ?? 'local-worker').slice(0, 100);
      const job = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            conversation_id: string;
            message_id: string;
            phone: string;
            payload: string | Record<string, unknown>;
            attempts: number;
          })[]
        >(
          `SELECT id,conversation_id,message_id,phone,payload,attempts
           FROM whatsapp_outbox
           WHERE account_id=? AND (
             (status IN ('pending','failed') AND available_at<=UTC_TIMESTAMP(3))
             OR (status='processing' AND lease_until<UTC_TIMESTAMP(3))
           )
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [accountId]
        );
        const row = rows[0];
        if (!row) return null;
        await connection.execute(
          `UPDATE whatsapp_outbox SET status='processing',attempts=attempts+1,
           worker_id=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [workerId, row.id]
        );
        return {
          ...row,
          attempts: Number(row.attempts) + 1,
          payload:
            typeof row.payload === 'string'
              ? JSON.parse(row.payload)
              : row.payload,
        };
      });
      return Response.json({ job });
    }

    if (action === 'complete_outbox') {
      const providerMessageId = String(body.providerMessageId ?? '');
      if (!providerMessageId) throw new Error('providerMessageId is required.');
      const result = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            conversation_id: string;
            message_id: string;
          })[]
        >(
          `SELECT id,conversation_id,message_id FROM whatsapp_outbox
           WHERE id=? AND account_id=? LIMIT 1 FOR UPDATE`,
          [String(body.jobId), accountId]
        );
        const job = rows[0];
        if (!job) throw new Error('Outbox job not found.');
        const dedupeKey = messageDedupeKey(
          job.conversation_id,
          providerMessageId
        );
        await connection.execute(
          'DELETE FROM messages WHERE dedupe_key=? AND id<>?',
          [dedupeKey, job.message_id]
        );
        await connection.execute(
          `UPDATE messages SET message_id=?,dedupe_key=?,status='sent'
           WHERE id=? AND conversation_id=?`,
          [providerMessageId, dedupeKey, job.message_id, job.conversation_id]
        );
        await connection.execute(
          `UPDATE whatsapp_outbox SET status='sent',provider_message_id=?,sent_at=UTC_TIMESTAMP(3),
           lease_until=NULL,last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [providerMessageId, job.id]
        );
        return { messageId: job.message_id };
      });
      return Response.json({ success: true, ...result });
    }

    if (action === 'fail_outbox') {
      const result = await transaction(async (connection) => {
        const [rows] = await connection.execute<
          (RowDataPacket & {
            id: string;
            message_id: string;
            attempts: number;
          })[]
        >(
          `SELECT id,message_id,attempts FROM whatsapp_outbox
           WHERE id=? AND account_id=? LIMIT 1 FOR UPDATE`,
          [String(body.jobId), accountId]
        );
        const job = rows[0];
        if (!job) throw new Error('Outbox job not found.');
        const dead = Number(job.attempts) >= 5;
        const delaySeconds = Math.min(
          300,
          5 * 2 ** Math.max(0, Number(job.attempts) - 1)
        );
        const availableAt = new Date(Date.now() + delaySeconds * 1000);
        await connection.execute(
          `UPDATE whatsapp_outbox SET status=?,available_at=?,lease_until=NULL,last_error=?,
           updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [
            dead ? 'dead' : 'failed',
            availableAt,
            String(body.error ?? 'Send failed'),
            job.id,
          ]
        );
        if (dead) {
          await connection.execute(
            "UPDATE messages SET status='failed' WHERE id=?",
            [job.message_id]
          );
        }
        return { dead, retryInSeconds: dead ? null : delaySeconds };
      });
      return Response.json({ success: true, ...result });
    }

    if (action === 'resolve_conversation') {
      const rows = await selectRows<(RowDataPacket & { phone: string })[]>(
        `SELECT c.phone FROM conversations v JOIN contacts c ON c.id=v.contact_id
          WHERE v.id=? AND v.account_id=? LIMIT 1`,
        [String(body.conversationId), accountId]
      );
      if (!rows[0]) throw new Error('Conversation not found.');
      return Response.json({ phone: rows[0].phone });
    }

    if (action === 'persist_message') {
      const externalId = String(body.messageId ?? '');
      if (!externalId) throw new Error('messageId is required.');
      const direction = body.fromMe ? 'agent' : 'customer';
      const contentType = [
        'text',
        'image',
        'document',
        'audio',
        'video',
        'location',
        'template',
        'interactive',
      ].includes(String(body.contentType))
        ? String(body.contentType)
        : 'text';
      const normalized = phone(body.phone);
      if (!normalized) throw new Error('Valid phone is required.');
      const normalizedKey = phoneKey(normalized);
      const userId = String(body.userId ?? '');
      if (!userId) throw new Error('userId is required.');

      const result = await transaction(async (connection) => {
        const [identities] = await connection.execute<
          (RowDataPacket & { contact_id: string })[]
        >(
          'SELECT contact_id FROM contact_phone_identities WHERE account_id=? AND phone_key=? LIMIT 1 FOR UPDATE',
          [accountId, normalizedKey]
        );
        let contactId = identities[0]?.contact_id;
        if (!contactId) {
          const candidateId = randomUUID();
          await connection.execute(
            `INSERT IGNORE INTO contacts(id,account_id,user_id,phone,name,source,preferred_contact,whatsapp_consent)
             VALUES(?,?,?,?,?,'whatsapp','whatsapp',TRUE)`,
            [
              candidateId,
              accountId,
              userId,
              normalized,
              String(body.name ?? normalized),
            ]
          );
          const [contacts] = await connection.execute<
            (RowDataPacket & { id: string })[]
          >(
            'SELECT id FROM contacts WHERE account_id=? AND phone=? LIMIT 1 FOR UPDATE',
            [accountId, normalized]
          );
          contactId = contacts[0]?.id;
          if (!contactId) throw new Error('Failed to resolve contact.');
          await connection.execute(
            `INSERT INTO contact_phone_identities(account_id,phone_key,contact_id,source)
             VALUES(?,?,?,'whatsapp')
             ON DUPLICATE KEY UPDATE contact_id=contact_id`,
            [accountId, normalizedKey, contactId]
          );
          const [winner] = await connection.execute<
            (RowDataPacket & { contact_id: string })[]
          >(
            'SELECT contact_id FROM contact_phone_identities WHERE account_id=? AND phone_key=? LIMIT 1',
            [accountId, normalizedKey]
          );
          contactId = winner[0]?.contact_id ?? contactId;
        }
        const profilePicUrl = String(body.profilePicUrl ?? '');
        if (
          /^https:\/\//i.test(profilePicUrl) &&
          profilePicUrl.length <= 4096
        ) {
          await connection.execute(
            'UPDATE contacts SET avatar_url=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
            [profilePicUrl, contactId, accountId]
          );
        }
        const [conversations] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >(
          'SELECT id FROM conversations WHERE account_id=? AND contact_id=? LIMIT 1 FOR UPDATE',
          [accountId, contactId]
        );
        let conversationId = conversations[0]?.id;
        if (!conversationId) {
          conversationId = randomUUID();
          await connection.execute(
            "INSERT INTO conversations(id,account_id,user_id,contact_id,status) VALUES(?,?,?,?,'open')",
            [conversationId, accountId, userId, contactId]
          );
        }
        const id = randomUUID();
        const dedupeKey = messageDedupeKey(conversationId, externalId);
        const [insertResult] = await connection.execute<
          import('mysql2').ResultSetHeader
        >(
          `INSERT IGNORE INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,message_id,dedupe_key,status,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            conversationId,
            direction,
            contentType,
            body.text ? String(body.text) : null,
            body.mediaUrl ? String(body.mediaUrl) : null,
            externalId,
            dedupeKey,
            direction === 'customer' ? 'delivered' : 'sent',
            new Date(String(body.timestamp ?? new Date().toISOString())),
          ]
        );
        const inserted = insertResult.affectedRows > 0;
        if (inserted) {
          await connection.execute(
            `UPDATE conversations SET last_message_text=?,last_message_at=?,unread_count=unread_count+?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
            [
              String(body.text ?? `[${contentType}]`),
              new Date(String(body.timestamp ?? new Date().toISOString())),
              direction === 'customer' ? 1 : 0,
              conversationId,
            ]
          );
        }
        const [stored] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >('SELECT id FROM messages WHERE dedupe_key=? LIMIT 1', [dedupeKey]);
        return {
          messageId: stored[0]?.id ?? id,
          conversationId,
          contactId,
          duplicate: !inserted,
          inserted,
        };
      });
      // Imported history belongs in the Inbox but should not interrupt the
      // team. New customer messages receive the normal realtime/browser/push
      // notification path.
      if (result.inserted && direction === 'customer' && !body.historical) {
        await notifyAccountEvent({
          accountId,
          type: 'new_message_received',
          category: 'inbox',
          priority: 'high',
          title: `Nova mensagem de ${String(body.name ?? normalized)}`,
          body: String(body.text ?? 'Nova mensagem recebida.'),
          actionUrl: `/inbox?c=${result.conversationId}`,
          contactId: result.contactId,
          dedupeKey: `whatsapp-incoming:${externalId}`,
        }).catch((notificationError) => {
          console.error(
            '[whatsapp-bridge] inbox notification failed:',
            notificationError
          );
        });
      }
      return Response.json(result);
    }

    if (action === 'persist_outgoing') {
      const conversationId = String(body.conversationId);
      const externalId = String(body.messageId ?? '');
      if (!externalId) throw new Error('messageId is required.');
      const dedupeKey = messageDedupeKey(conversationId, externalId);
      const result = await transaction(async (connection) => {
        const id = randomUUID();
        const [insertResult] = await connection.execute<
          import('mysql2').ResultSetHeader
        >(
          `INSERT IGNORE INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,template_name,message_id,dedupe_key,status,reply_to_message_id,interactive_payload)
           SELECT ?,v.id,?,?,?,?,?,?,?,'sent',?,? FROM conversations v WHERE v.id=? AND v.account_id=?`,
          [
            id,
            String(body.senderType ?? 'agent'),
            String(body.contentType ?? 'text'),
            body.text ? String(body.text) : null,
            body.mediaUrl ? String(body.mediaUrl) : null,
            body.templateName ? String(body.templateName) : null,
            externalId,
            dedupeKey,
            body.replyToMessageId ? String(body.replyToMessageId) : null,
            body.interactivePayload
              ? JSON.stringify(body.interactivePayload)
              : null,
            conversationId,
            accountId,
          ]
        );
        if (insertResult.affectedRows > 0) {
          await connection.execute(
            'UPDATE conversations SET last_message_text=?,last_message_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?',
            [
              String(body.text ?? `[${body.contentType ?? 'text'}]`),
              conversationId,
              accountId,
            ]
          );
        }
        const [stored] = await connection.execute<
          (RowDataPacket & { id: string })[]
        >('SELECT id FROM messages WHERE dedupe_key=? LIMIT 1', [dedupeKey]);
        if (!stored[0]) throw new Error('Conversation not found.');
        return {
          messageId: stored[0].id,
          duplicate: insertResult.affectedRows === 0,
        };
      });
      return Response.json(result);
    }

    if (action === 'ack') {
      const status = String(body.status);
      if (!['sent', 'delivered', 'read', 'failed'].includes(status)) {
        throw new Error('Invalid acknowledgement status.');
      }
      await mutate(
        `UPDATE messages m
         JOIN conversations v ON v.id=m.conversation_id
         SET m.status=CASE
           WHEN m.status='read' THEN 'read'
           WHEN m.status='delivered' AND ?='sent' THEN 'delivered'
           WHEN m.status IN ('sent','delivered','read') AND ?='failed' THEN m.status
           ELSE ? END
         WHERE m.message_id=? AND v.account_id=?`,
        [status, status, status, String(body.messageId), accountId]
      );
      return Response.json({ success: true });
    }
    throw new Error('Unsupported action.');
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Bridge request failed.',
      },
      { status: 400 }
    );
  }
}

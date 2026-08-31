import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';

function authorized(request: Request) {
  const secret = process.env.WHATSAPP_WORKER_SECRET;
  const supplied = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');
  if (!secret || !supplied) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
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
  if (!authorized(request))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const accountId = String(body.accountId ?? '');
    if (!accountId) throw new Error('accountId is required.');

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
          duplicate: !inserted,
        };
      });
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

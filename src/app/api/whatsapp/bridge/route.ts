import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { mutate, selectRows, transaction } from '@/lib/mysql/db';

function authorized(request: Request) {
  const secret = process.env.WHATSAPP_WORKER_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || !supplied) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function phone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
      const duplicate = await selectRows<(RowDataPacket & { id: string })[]>(
        'SELECT id FROM messages WHERE message_id=? LIMIT 1', [externalId]
      );
      if (duplicate[0]) return Response.json({ messageId: duplicate[0].id });

      const direction = body.fromMe ? 'agent' : 'customer';
      const contentType = ['text','image','document','audio','video','location','template','interactive'].includes(String(body.contentType)) ? String(body.contentType) : 'text';
      const normalized = phone(body.phone);
      if (!normalized) throw new Error('Valid phone is required.');
      const userId = String(body.userId ?? '');
      if (!userId) throw new Error('userId is required.');

      const result = await transaction(async (connection) => {
        const [contacts] = await connection.execute<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM contacts WHERE account_id=? AND phone=? LIMIT 1 FOR UPDATE', [accountId, normalized]
        );
        let contactId = contacts[0]?.id;
        if (!contactId) {
          contactId = randomUUID();
          await connection.execute(
            `INSERT INTO contacts(id,account_id,user_id,phone,name,source,preferred_contact,whatsapp_consent)
             VALUES(?,?,?,?,?,'whatsapp','whatsapp',TRUE)`,
            [contactId, accountId, userId, normalized, String(body.name ?? normalized)]
          );
        }
        const [conversations] = await connection.execute<(RowDataPacket & { id: string })[]>(
          'SELECT id FROM conversations WHERE account_id=? AND contact_id=? LIMIT 1 FOR UPDATE', [accountId, contactId]
        );
        let conversationId = conversations[0]?.id;
        if (!conversationId) {
          conversationId = randomUUID();
          await connection.execute(
            'INSERT INTO conversations(id,account_id,user_id,contact_id,status) VALUES(?,?,?,?,\'open\')',
            [conversationId, accountId, userId, contactId]
          );
        }
        const id = randomUUID();
        await connection.execute(
          `INSERT INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,message_id,status,created_at)
           VALUES(?,?,?,?,?,?,?, ?, ?)`,
          [id, conversationId, direction, contentType, body.text ? String(body.text) : null, body.mediaUrl ? String(body.mediaUrl) : null, externalId, direction === 'customer' ? 'delivered' : 'sent', new Date(String(body.timestamp ?? new Date().toISOString()))]
        );
        await connection.execute(
          `UPDATE conversations SET last_message_text=?,last_message_at=?,unread_count=unread_count+?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [String(body.text ?? `[${contentType}]`), new Date(String(body.timestamp ?? new Date().toISOString())), direction === 'customer' ? 1 : 0, conversationId]
        );
        return { messageId: id, conversationId };
      });
      return Response.json(result);
    }

    if (action === 'persist_outgoing') {
      const id = randomUUID();
      await mutate(
        `INSERT INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,template_name,message_id,status,reply_to_message_id,interactive_payload)
         SELECT ?,v.id,?,?,?,?,?,?, 'sent',?,? FROM conversations v WHERE v.id=? AND v.account_id=?`,
        [id, String(body.senderType ?? 'agent'), String(body.contentType ?? 'text'), body.text ? String(body.text) : null, body.mediaUrl ? String(body.mediaUrl) : null, body.templateName ? String(body.templateName) : null, String(body.messageId), body.replyToMessageId ? String(body.replyToMessageId) : null, body.interactivePayload ? JSON.stringify(body.interactivePayload) : null, String(body.conversationId), accountId]
      );
      await mutate('UPDATE conversations SET last_message_text=?,last_message_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?', [String(body.text ?? `[${body.contentType ?? 'text'}]`), String(body.conversationId), accountId]);
      return Response.json({ messageId: id });
    }

    if (action === 'ack') {
      await mutate('UPDATE messages SET status=? WHERE message_id=?', [String(body.status), String(body.messageId)]);
      return Response.json({ success: true });
    }
    throw new Error('Unsupported action.');
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Bridge request failed.' }, { status: 400 });
  }
}

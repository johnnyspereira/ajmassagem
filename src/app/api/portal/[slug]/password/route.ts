import { randomBytes } from 'node:crypto';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { portalAuthEmail } from '@/lib/portal/identity';
import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const token = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length]
  ).join('');
  return `WA-${token.slice(0, 5)}-${token.slice(5)}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`portal-password:${clientIp(request)}`, {
    limit: 4,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { error: 'Informe um email válido.' },
      { status: 400 }
    );
  }

  const { slug } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select('account_id,enabled')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (!settings)
    return Response.json({ error: 'Portal indisponível.' }, { status: 404 });

  const generic = Response.json({
    ok: true,
    message:
      'Se o email estiver associado a um cliente, o link de acesso e a senha temporária serão enviados para o WhatsApp cadastrado.',
  });
  const { data: contacts } = await admin
    .from('contacts')
    .select('id,name,phone')
    .eq('account_id', settings.account_id)
    .ilike('email', email)
    .limit(2);
  if (!contacts || contacts.length !== 1 || !contacts[0].phone) return generic;
  const contact = contacts[0];

  const { data: qrConfig } = await admin
    .from('whatsapp_config')
    .select('user_id')
    .eq('account_id', settings.account_id)
    .maybeSingle();
  const auditUserId =
    qrConfig?.user_id || (await resolveAuditUserId(admin, settings.account_id));
  let status = remoteWhatsAppWorker.enabled()
    ? await remoteWhatsAppWorker.status({
        accountId: settings.account_id,
        userId: auditUserId,
        autoStart: true,
      })
    : await getLocalQrStatus();
  if (!status.connected && !remoteWhatsAppWorker.enabled()) {
    status = await startLocalQrSession(settings.account_id, auditUserId);
  }
  if (!status.connected) {
    return Response.json(
      {
        error:
          'O WhatsApp da clínica está temporariamente indisponível. Tente novamente mais tarde.',
      },
      { status: 503 }
    );
  }

  let { data: access } = await admin
    .from('client_portal_access')
    .select('id,auth_user_id,portal_auth_email')
    .eq('account_id', settings.account_id)
    .eq('contact_id', contact.id)
    .maybeSingle();
  const internalEmail = portalAuthEmail(settings.account_id, contact.id);
  const previousAccess = access ? { ...access } : null;
  let createdUserId: string | null = null;
  let createdAccess = false;
  const password = temporaryPassword();

  let hasIsolatedIdentity = access?.portal_auth_email === internalEmail;
  if (hasIsolatedIdentity && access) {
    const { data: existingAuth } = await admin.auth.admin.getUserById(
      access.auth_user_id
    );
    hasIsolatedIdentity =
      existingAuth.user?.email?.toLowerCase() === internalEmail;
  }

  if (!hasIsolatedIdentity) {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: {
          portal_password_temporary: true,
          portal_account_id: settings.account_id,
          portal_contact_id: contact.id,
          portal_identity: true,
        },
      });
    if (createError || !created.user) {
      console.warn(
        '[portal-password] auth user could not be created:',
        createError?.message
      );
      return generic;
    }
    createdUserId = created.user.id;
    const accessMutation = access
      ? admin
          .from('client_portal_access')
          .update({
            auth_user_id: created.user.id,
            portal_auth_email: internalEmail,
            email,
            requires_password_change: true,
            password_issued_at: new Date().toISOString(),
          })
          .eq('id', access.id)
      : admin.from('client_portal_access').insert({
          account_id: settings.account_id,
          contact_id: contact.id,
          auth_user_id: created.user.id,
          portal_auth_email: internalEmail,
          email,
          requires_password_change: true,
          password_issued_at: new Date().toISOString(),
        });
    const { data: inserted, error: accessError } = await accessMutation
      .select('id,auth_user_id,portal_auth_email')
      .single();
    if (accessError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return generic;
    }
    access = inserted;
    createdAccess = !previousAccess;
  }

  let { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('account_id', settings.account_id)
    .eq('contact_id', contact.id)
    .maybeSingle();
  if (!conversation) {
    const { data: inserted, error } = await admin
      .from('conversations')
      .insert({
        account_id: settings.account_id,
        user_id: auditUserId,
        contact_id: contact.id,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    conversation = inserted;
  }

  try {
    if (!createdUserId && access) {
      const { error } = await admin.auth.admin.updateUserById(
        access.auth_user_id,
        {
          password,
          user_metadata: {
            portal_password_temporary: true,
            portal_account_id: settings.account_id,
            portal_contact_id: contact.id,
            portal_identity: true,
          },
        }
      );
      if (error) throw error;
      await admin
        .from('client_portal_access')
        .update({
          requires_password_change: true,
          password_issued_at: new Date().toISOString(),
        })
        .eq('id', access.id);
    }
    const { data: magicLink, error: magicLinkError } =
      await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: internalEmail,
      });
    if (magicLinkError || !magicLink.properties?.hashed_token) {
      throw (
        magicLinkError || new Error('Não foi possível criar o link de acesso.')
      );
    }
    const portalUrl = new URL(
      `/portal/${encodeURIComponent(slug)}`,
      new URL(request.url).origin
    );
    portalUrl.searchParams.set(
      'portal_token',
      magicLink.properties.hashed_token
    );

    const whatsappText = `Olá${contact.name ? `, ${contact.name.split(' ')[0]}` : ''}. ✨\n\nO seu acesso seguro ao *Portal 360* está pronto.\n\n👉 *Entrar automaticamente:*\n${portalUrl.toString()}\n\nSe preferir entrar manualmente, utilize o seu email e esta senha temporária:\n\n🔐 *${password}*\n\nO link é pessoal, de utilização única e expira por segurança. No primeiro acesso, poderá definir uma nova senha. Não partilhe estes dados.`;
    if (remoteWhatsAppWorker.enabled()) {
      await remoteWhatsAppWorker.send({
        accountId: settings.account_id,
        conversationId: conversation.id,
        message: {
          text: whatsappText,
          contentType: 'text',
          senderType: 'bot',
        },
      });
    } else {
      await sendTextViaLocalQr(
        settings.account_id,
        conversation.id,
        whatsappText,
        { senderType: 'bot' }
      );
    }
    return generic;
  } catch (error) {
    if (createdUserId) {
      if (createdAccess) {
        await admin
          .from('client_portal_access')
          .delete()
          .eq('auth_user_id', createdUserId);
      } else if (previousAccess) {
        await admin
          .from('client_portal_access')
          .update({
            auth_user_id: previousAccess.auth_user_id,
            portal_auth_email: previousAccess.portal_auth_email,
          })
          .eq('id', previousAccess.id);
      }
      await admin.auth.admin.deleteUser(createdUserId);
    }
    console.error('[portal-password] WhatsApp delivery failed:', error);
    return Response.json(
      {
        error:
          'Não foi possível enviar o link e a senha pelo WhatsApp neste momento.',
      },
      { status: 502 }
    );
  }
}

async function getLocalQrStatus() {
  const { getBaileysSessionStatus } = await import('@/lib/whatsapp/baileys');
  return getBaileysSessionStatus();
}

async function startLocalQrSession(accountId: string, userId: string) {
  const { startBaileysSession } = await import('@/lib/whatsapp/baileys');
  return startBaileysSession({
    accountId,
    userId,
    autoStart: true,
    restoreOnly: true,
  });
}

async function sendTextViaLocalQr(
  accountId: string,
  conversationId: string,
  text: string,
  options: { senderType?: 'agent' | 'bot'; replyToMessageId?: string | null }
) {
  const { sendTextViaBaileys } = await import('@/lib/whatsapp/baileys');
  return sendTextViaBaileys(accountId, conversationId, text, options);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access, user } = await requirePortalAccess(slug);
    const body = (await request.json()) as { password?: string };
    const password = body.password || '';
    if (
      password.length < 10 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return Response.json(
        { error: 'Use pelo menos 10 caracteres, incluindo letras e números.' },
        { status: 400 }
      );
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...user.user_metadata,
        portal_password_temporary: false,
      },
    });
    if (error) throw error;
    await admin
      .from('client_portal_access')
      .update({
        requires_password_change: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', access.id);
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

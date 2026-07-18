import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createPortalAuthClient } from '@/lib/portal/auth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

function clientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`portal-login:${clientIp(request)}`, {
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() || '';
  const password = body?.password || '';
  const invalid = Response.json(
    { error: 'Email ou palavra-passe incorretos.' },
    { status: 401 }
  );
  if (!email || !password) return invalid;

  const { slug } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select('account_id')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (!settings) return invalid;

  const { data: contacts } = await admin
    .from('contacts')
    .select('id')
    .eq('account_id', settings.account_id)
    .ilike('email', email)
    .limit(2);
  if (!contacts || contacts.length !== 1) return invalid;

  const { data: access } = await admin
    .from('client_portal_access')
    .select('portal_auth_email')
    .eq('account_id', settings.account_id)
    .eq('contact_id', contacts[0].id)
    .maybeSingle();
  if (!access?.portal_auth_email) {
    return Response.json(
      {
        error:
          'Este é o primeiro acesso ao Portal 360. Solicite uma senha exclusiva pelo WhatsApp.',
        code: 'PORTAL_SETUP_REQUIRED',
      },
      { status: 428 }
    );
  }

  const portalAuth = await createPortalAuthClient();
  const { error } = await portalAuth.auth.signInWithPassword({
    email: access.portal_auth_email,
    password,
  });
  if (error) return invalid;
  return Response.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limit = checkRateLimit(`portal-link:${clientIp(request)}`, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    tokenHash?: string;
  } | null;
  const tokenHash = body?.tokenHash?.trim() || '';
  if (!/^[A-Za-z0-9_-]{20,500}$/.test(tokenHash)) {
    return Response.json(
      { error: 'O link de acesso é inválido ou está incompleto.' },
      { status: 400 }
    );
  }

  const portalAuth = await createPortalAuthClient();
  const { data, error } = await portalAuth.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (error || !data.user) {
    return Response.json(
      {
        error:
          'Este link expirou ou já foi utilizado. Solicite um novo acesso.',
      },
      { status: 401 }
    );
  }

  const { slug } = await params;
  const admin = supabaseAdmin();
  const { data: settings } = await admin
    .from('client_portal_settings')
    .select('account_id')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  const { data: access } = settings
    ? await admin
        .from('client_portal_access')
        .select('id,portal_auth_email')
        .eq('account_id', settings.account_id)
        .eq('auth_user_id', data.user.id)
        .maybeSingle()
    : { data: null };
  if (
    !access?.portal_auth_email ||
    data.user.email?.toLowerCase() !== access.portal_auth_email.toLowerCase()
  ) {
    await portalAuth.auth.signOut();
    return Response.json(
      { error: 'Acesso não associado a este portal.' },
      { status: 403 }
    );
  }
  return Response.json({ ok: true });
}

export async function DELETE() {
  const portalAuth = await createPortalAuthClient();
  await portalAuth.auth.signOut();
  return Response.json({ ok: true });
}

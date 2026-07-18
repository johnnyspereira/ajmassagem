import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  findMissingRequiredQuestion,
  mergeAnamnesisConfig,
} from '@/lib/clinic/anamnesis-config';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

function tokenValid(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    token
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!tokenValid(token))
    return Response.json({ error: 'Ficha inválida.' }, { status: 404 });
  const db = supabaseAdmin();
  const { data: form } = await db
    .from('clinic_anamnesis_forms')
    .select(
      'id,account_id,status,client_name,client_email,client_phone,birth_date,selected_modalities,answers,health_consent,privacy_consent,signature_name,submitted_at,expires_at,service:clinic_services(name,category),appointment:clinic_appointments!clinic_anamnesis_forms_appointment_id_fkey(scheduled_start),account:accounts(name,logo_url)'
    )
    .eq('public_token', token)
    .maybeSingle();
  if (!form || ['expired', 'revoked'].includes(form.status))
    return Response.json({ error: 'Ficha indisponível.' }, { status: 404 });
  if (new Date(form.expires_at) < new Date() && form.status === 'pending')
    return Response.json({ error: 'Este link expirou.' }, { status: 410 });
  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('anamnesis_title,anamnesis_intro,anamnesis_form_config')
    .eq('account_id', form.account_id)
    .maybeSingle();
  return Response.json({
    form: {
      ...form,
      form_title: settings?.anamnesis_title,
      form_intro: settings?.anamnesis_intro,
      config: mergeAnamnesisConfig(settings?.anamnesis_form_config),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const limit = checkRateLimit(`anamnesis-submit:${tokenFrom(request)}`, {
    limit: 8,
    windowMs: 60 * 60_000,
  });
  if (!limit.success) return rateLimitResponse(limit);
  const { token } = await params;
  if (!tokenValid(token))
    return Response.json({ error: 'Ficha inválida.' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    birthDate?: string;
    selectedModalities?: string[];
    answers?: Record<string, unknown>;
    healthConsent?: boolean;
    privacyConsent?: boolean;
    signatureName?: string;
  } | null;
  if (
    !body?.clientName?.trim() ||
    !body.signatureName?.trim() ||
    !body.healthConsent ||
    !body.privacyConsent
  ) {
    return Response.json(
      { error: 'Preencha a identificação, assinatura e consentimentos.' },
      { status: 400 }
    );
  }
  if (JSON.stringify(body.answers || {}).length > 30_000)
    return Response.json(
      { error: 'Ficha demasiado extensa.' },
      { status: 400 }
    );

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('clinic_anamnesis_forms')
    .select('id,account_id,status,expires_at')
    .eq('public_token', token)
    .maybeSingle();
  if (!existing || ['reviewed', 'expired', 'revoked'].includes(existing.status))
    return Response.json({ error: 'Ficha indisponível.' }, { status: 409 });
  if (new Date(existing.expires_at) < new Date())
    return Response.json({ error: 'Este link expirou.' }, { status: 410 });

  const { data: settings } = await db
    .from('clinic_communication_settings')
    .select('anamnesis_form_config')
    .eq('account_id', existing.account_id)
    .maybeSingle();
  const missingQuestion = findMissingRequiredQuestion(
    mergeAnamnesisConfig(settings?.anamnesis_form_config),
    body.selectedModalities || [],
    body.answers || {}
  );
  if (missingQuestion) {
    return Response.json(
      { error: `Responda à pergunta: ${missingQuestion.label}` },
      { status: 400 }
    );
  }

  const { error } = await db
    .from('clinic_anamnesis_forms')
    .update({
      status: 'submitted',
      client_name: body.clientName.trim().slice(0, 160),
      client_email: body.clientEmail?.trim().slice(0, 255) || null,
      client_phone: body.clientPhone?.trim().slice(0, 40) || null,
      birth_date: body.birthDate || null,
      selected_modalities: (body.selectedModalities || []).slice(0, 20),
      answers: body.answers || {},
      health_consent: true,
      privacy_consent: true,
      signature_name: body.signatureName.trim().slice(0, 160),
      submitted_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

function tokenFrom(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

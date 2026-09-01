import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const REQUEST_TYPES = new Set([
  'access',
  'rectification',
  'erasure',
  'restriction',
  'objection',
  'portability',
  'withdraw_consent',
]);

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function text(value: unknown, max = 1000) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const db = supabaseAdmin();
    const [settings, requests, incidents] = await Promise.all([
      db
        .from('privacy_settings')
        .select('*')
        .eq('account_id', ctx.accountId)
        .maybeSingle(),
      db
        .from('privacy_data_subject_requests')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('privacy_incidents')
        .select('*')
        .eq('account_id', ctx.accountId)
        .order('detected_at', { ascending: false })
        .limit(50),
    ]);
    const error = settings.error || requests.error || incidents.error;
    if (error) throw error;
    return Response.json({
      settings: settings.data,
      requests: requests.data ?? [],
      incidents: incidents.data ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;
    const payload = {
      account_id: ctx.accountId,
      controller_name: text(body.controllerName, 255),
      controller_email: text(body.controllerEmail, 320),
      controller_address: text(body.controllerAddress, 2000),
      dpo_email: text(body.dpoEmail, 320),
      privacy_policy_url: text(body.privacyPolicyUrl, 2000),
      privacy_notice_version: text(body.privacyNoticeVersion, 80) || '1.0',
      contact_retention_months: integer(
        body.contactRetentionMonths,
        60,
        1,
        240
      ),
      health_retention_months: integer(body.healthRetentionMonths, 60, 1, 240),
      communication_retention_months: integer(
        body.communicationRetentionMonths,
        24,
        1,
        120
      ),
      finance_retention_months: integer(
        body.financeRetentionMonths,
        120,
        1,
        240
      ),
      inactive_contact_retention_months: integer(
        body.inactiveContactRetentionMonths,
        36,
        1,
        240
      ),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin()
      .from('privacy_settings')
      .upsert(payload, { onConflict: 'account_id' })
      .select('*')
      .single();
    if (error) throw error;
    return Response.json({ settings: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;
    const requestType = String(body.requestType ?? '');
    if (!REQUEST_TYPES.has(requestType)) {
      return Response.json(
        { error: 'Tipo de pedido inválido.' },
        { status: 400 }
      );
    }
    const now = new Date();
    const due = new Date(now);
    due.setMonth(due.getMonth() + 1);
    const { data, error } = await supabaseAdmin()
      .from('privacy_data_subject_requests')
      .insert({
        id: crypto.randomUUID(),
        account_id: ctx.accountId,
        contact_id: text(body.contactId, 36),
        request_type: requestType,
        requester_name: text(body.requesterName, 255),
        requester_email: text(body.requesterEmail, 320),
        details: text(body.details, 5000),
        source: 'admin',
        due_at: due.toISOString(),
        created_by_user_id: ctx.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return Response.json({ request: data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

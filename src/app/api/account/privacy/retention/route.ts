import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const body = (await request.json()) as {
      execute?: boolean;
      confirmText?: string;
    };
    const db = supabaseAdmin();
    const { data: settings } = await db
      .from('privacy_settings')
      .select('inactive_contact_retention_months')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    const months = settings?.inactive_contact_retention_months ?? 36;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const { data: candidates, error } = await db
      .from('contacts')
      .select('id,name,email,updated_at')
      .eq('account_id', ctx.accountId)
      .is('anonymized_at', null)
      .lt('updated_at', cutoff.toISOString())
      .limit(500);
    if (error) throw error;
    const ids = (candidates ?? []).map((v) => v.id);
    if (!ids.length)
      return Response.json({
        cutoff: cutoff.toISOString(),
        eligible: [],
        excluded: [],
        count: 0,
      });
    const [sales, openRequests] = await Promise.all([
      db
        .from('finance_sales')
        .select('contact_id')
        .eq('account_id', ctx.accountId)
        .in('contact_id', ids),
      db
        .from('privacy_data_subject_requests')
        .select('contact_id')
        .eq('account_id', ctx.accountId)
        .in('contact_id', ids)
        .in('status', ['received', 'identity_check', 'in_progress']),
    ]);
    const excludedIds = new Set([
      ...(sales.data ?? []).map((v) => v.contact_id),
      ...(openRequests.data ?? []).map((v) => v.contact_id),
    ]);
    const eligible = (candidates ?? []).filter((v) => !excludedIds.has(v.id));
    const excluded = (candidates ?? []).filter((v) => excludedIds.has(v.id));
    if (!body.execute)
      return Response.json({
        cutoff: cutoff.toISOString(),
        eligible,
        excluded,
        count: eligible.length,
      });
    if (body.confirmText !== 'APLICAR RETENÇÃO')
      return Response.json({ error: 'Confirmação inválida.' }, { status: 400 });
    const now = new Date().toISOString();
    for (const contact of eligible) {
      await db
        .from('contacts')
        .update({
          phone: `anon-${contact.id}`,
          name: 'Titular anonimizado',
          email: null,
          company: null,
          avatar_url: null,
          birth_date: null,
          tax_id: null,
          address_line: null,
          postal_code: null,
          city: null,
          marketing_consent: false,
          marketing_whatsapp_consent: false,
          whatsapp_consent: false,
          privacy_review_status: 'withdrawn',
          anonymized_at: now,
        })
        .eq('id', contact.id)
        .eq('account_id', ctx.accountId);
    }
    await db
      .from('privacy_settings')
      .update({ last_retention_run_at: now })
      .eq('account_id', ctx.accountId);
    await db
      .from('privacy_audit_events')
      .insert({
        id: crypto.randomUUID(),
        account_id: ctx.accountId,
        actor_user_id: ctx.userId,
        action: 'retention_executed',
        entity_type: 'account',
        entity_id: ctx.accountId,
        reason: 'Execução manual confirmada',
        metadata: { cutoff, count: eligible.length, excluded: excluded.length },
      });
    return Response.json({
      ok: true,
      count: eligible.length,
      excluded: excluded.length,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

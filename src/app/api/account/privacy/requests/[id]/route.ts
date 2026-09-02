import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const STATUSES = new Set([
  'received',
  'identity_check',
  'in_progress',
  'completed',
  'rejected',
]);
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const db = supabaseAdmin();
    const { data: dsr } = await db
      .from('privacy_data_subject_requests')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (!dsr)
      return Response.json(
        { error: 'Pedido não encontrado.' },
        { status: 404 }
      );
    const action = String(body.action || '');
    const now = new Date().toISOString();
    if (action === 'verify') {
      await db
        .from('privacy_data_subject_requests')
        .update({ status: 'in_progress', identity_verified_at: now })
        .eq('id', id);
    } else if (action === 'complete') {
      if (!dsr.identity_verified_at)
        return Response.json(
          { error: 'Confirme primeiro a identidade do titular.' },
          { status: 409 }
        );
      await db
        .from('privacy_data_subject_requests')
        .update({
          status: 'completed',
          decision: String(body.decision || 'approved'),
          resolution_notes: String(body.notes || '').slice(0, 5000) || null,
          resolved_at: now,
          completed_by_user_id: ctx.userId,
        })
        .eq('id', id);
    } else if (action === 'reject') {
      if (!String(body.notes || '').trim())
        return Response.json(
          { error: 'Indique o fundamento da recusa.' },
          { status: 400 }
        );
      await db
        .from('privacy_data_subject_requests')
        .update({
          status: 'rejected',
          decision: 'rejected',
          rejection_basis: String(body.notes).slice(0, 5000),
          resolved_at: now,
          completed_by_user_id: ctx.userId,
        })
        .eq('id', id);
    } else if (action === 'anonymize') {
      await requireRole('owner');
      if (body.confirmText !== 'APAGAR DADOS')
        return Response.json(
          { error: 'Confirmação inválida.' },
          { status: 400 }
        );
      if (
        !dsr.identity_verified_at ||
        dsr.request_type !== 'erasure' ||
        !dsr.contact_id
      )
        return Response.json(
          {
            error:
              'O apagamento exige pedido de apagamento e identidade confirmada.',
          },
          { status: 409 }
        );
      const marker = `anon-${dsr.contact_id}`;
      await db
        .from('clinic_anamnesis_forms')
        .update({
          client_name: 'Titular anonimizado',
          client_email: null,
          client_phone: null,
          birth_date: null,
          answers: {},
          signature_name: null,
          status: 'revoked',
        })
        .eq('account_id', ctx.accountId)
        .eq('contact_id', dsr.contact_id);
      const { error } = await db
        .from('contacts')
        .update({
          phone: marker,
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
          processing_restricted_at: now,
          anonymized_at: now,
        })
        .eq('account_id', ctx.accountId)
        .eq('id', dsr.contact_id);
      if (error) throw error;
      await db
        .from('privacy_data_subject_requests')
        .update({
          status: 'completed',
          decision: 'approved',
          resolution_notes: String(
            body.notes || 'Dados identificativos anonimizados.'
          ).slice(0, 5000),
          resolved_at: now,
          completed_by_user_id: ctx.userId,
        })
        .eq('id', id);
    } else if (STATUSES.has(action)) {
      await db
        .from('privacy_data_subject_requests')
        .update({ status: action })
        .eq('id', id);
    } else return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    await db
      .from('privacy_audit_events')
      .insert({
        id: crypto.randomUUID(),
        account_id: ctx.accountId,
        actor_user_id: ctx.userId,
        action: `dsr_${action}`,
        entity_type: 'data_subject_request',
        entity_id: id,
        reason: String(body.notes || '').slice(0, 2000) || null,
        metadata: {
          request_type: dsr.request_type,
          contact_id: dsr.contact_id,
        },
      });
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

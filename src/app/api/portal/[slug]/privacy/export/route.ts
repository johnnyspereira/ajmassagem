import { portalErrorResponse, requirePortalAccess } from '@/lib/portal/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const accountId = access.account_id;
    const contactId = access.contact_id;
    const [
      contact,
      appointments,
      anamnesis,
      vouchers,
      packs,
      consents,
      requests,
    ] = await Promise.all([
      admin
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', contactId)
        .single(),
      admin
        .from('clinic_appointments')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('scheduled_start', { ascending: false }),
      admin
        .from('clinic_anamnesis_forms')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }),
      admin
        .from('finance_vouchers')
        .select('*')
        .eq('account_id', accountId)
        .eq('owner_contact_id', contactId)
        .order('created_at', { ascending: false }),
      admin
        .from('finance_client_packs')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }),
      admin
        .from('privacy_consent_events')
        .select('purpose,status,legal_basis,policy_version,source,occurred_at')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false }),
      admin
        .from('privacy_data_subject_requests')
        .select('request_type,status,due_at,resolved_at,created_at')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }),
    ]);
    const failures = [
      contact,
      appointments,
      anamnesis,
      vouchers,
      packs,
      consents,
      requests,
    ]
      .map((result) => result.error)
      .filter(Boolean);
    if (failures.length) throw failures[0];
    const document = {
      exported_at: new Date().toISOString(),
      format: 'RGPD-portability-json-v1',
      subject: contact.data,
      appointments: appointments.data ?? [],
      anamnesis: anamnesis.data ?? [],
      vouchers: vouchers.data ?? [],
      packs: packs.data ?? [],
      consents: consents.data ?? [],
      privacy_requests: requests.data ?? [],
    };
    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="dados-pessoais-${contactId}.json"`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

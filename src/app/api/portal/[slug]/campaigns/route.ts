import {
  portalErrorResponse,
  PortalError,
  requirePortalAccess,
} from '@/lib/portal/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { admin, access } = await requirePortalAccess(slug);
    const body = await request.json().catch(() => null);
    const campaignId =
      typeof body?.campaignId === 'string' ? body.campaignId : '';
    if (!campaignId) throw new PortalError('Campanha inválida.', 400);
    const now = new Date().toISOString();
    const { data: campaign } = await admin
      .from('portal_campaigns')
      .select('id,capacity,status,starts_at,ends_at')
      .eq('id', campaignId)
      .eq('account_id', access.account_id)
      .eq('status', 'published')
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .maybeSingle();
    if (!campaign)
      throw new PortalError('Esta campanha já não está disponível.', 404);
    if (campaign.capacity) {
      const { count } = await admin
        .from('portal_campaign_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .neq('status', 'cancelled');
      if ((count ?? 0) >= campaign.capacity)
        throw new PortalError(
          'Esta campanha já atingiu o limite de adesões.',
          409
        );
    }
    const { error } = await admin
      .from('portal_campaign_enrollments')
      .upsert(
        {
          account_id: access.account_id,
          campaign_id: campaign.id,
          contact_id: access.contact_id,
          status: 'joined',
          joined_at: now,
        },
        { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true }
      );
    if (error) throw error;
    await admin
      .from('portal_notifications')
      .insert({
        account_id: access.account_id,
        contact_id: access.contact_id,
        type: 'campaign',
        title: 'Adesão registada',
        body: 'A sua adesão à campanha foi recebida. Entraremos em contacto consigo.',
        action_tab: 'campaigns',
        metadata: { campaign_id: campaign.id },
      });
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

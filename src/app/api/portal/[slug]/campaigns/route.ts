import { randomUUID } from 'node:crypto';

import { notifyAccountEvent } from '@/lib/notifications/account-events';
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
      .select('id,title,capacity,status,starts_at,ends_at')
      .eq('id', campaignId)
      .eq('account_id', access.account_id)
      .eq('status', 'published')
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .maybeSingle();
    if (!campaign)
      throw new PortalError('Esta campanha já não está disponível.', 404);
    const { data: existing } = await admin
      .from('portal_campaign_enrollments')
      .select('id,status')
      .eq('campaign_id', campaign.id)
      .eq('contact_id', access.contact_id)
      .maybeSingle();
    if (existing && existing.status !== 'cancelled') {
      return Response.json({ ok: true, duplicate: true });
    }
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
    const enrollmentId = existing?.id || randomUUID();
    const enrollment = {
      account_id: access.account_id,
      campaign_id: campaign.id,
      contact_id: access.contact_id,
      status: 'joined',
      joined_at: now,
    };
    const { error } = existing
      ? await admin
          .from('portal_campaign_enrollments')
          .update(enrollment)
          .eq('id', existing.id)
      : await admin
          .from('portal_campaign_enrollments')
          .insert({ id: enrollmentId, ...enrollment });
    if (error) throw error;
    await admin.from('portal_notifications').insert({
      account_id: access.account_id,
      contact_id: access.contact_id,
      type: 'campaign',
      title: 'Adesão registada',
      body: 'A sua adesão à campanha foi recebida. Entraremos em contacto consigo.',
      action_tab: 'campaigns',
      metadata: { campaign_id: campaign.id },
    });
    const { data: contact } = await admin
      .from('contacts')
      .select('name,phone,email')
      .eq('id', access.contact_id)
      .maybeSingle();
    const contactName = contact?.name || contact?.phone || 'Um cliente';
    const details = [contact?.phone, contact?.email]
      .filter(Boolean)
      .join(' · ');
    await notifyAccountEvent({
      accountId: access.account_id,
      type: 'portal_campaign_interest',
      category: 'broadcast',
      priority: 'high',
      title: 'Novo interesse numa campanha',
      body: `${contactName} aderiu à campanha “${campaign.title}”.`,
      actionUrl: `/portal-campaigns?campaign=${campaign.id}`,
      contactId: access.contact_id,
      dedupeKey: `campaign-interest:${campaign.id}:${enrollmentId}:${now}`,
      metadata: {
        campaign_id: campaign.id,
        campaign_title: campaign.title,
        enrollment_id: enrollmentId,
      },
      whatsappText: [
        '📣 *Novo interesse numa campanha*',
        '',
        `Cliente: *${contactName}*`,
        details ? `Contacto: ${details}` : '',
        `Campanha: *${campaign.title}*`,
        '',
        `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://jpmassagem.pt'}/portal-campaigns?campaign=${campaign.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

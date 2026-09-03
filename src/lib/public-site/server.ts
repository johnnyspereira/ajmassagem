import { cache } from 'react';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';
import type { PublicSiteSettings } from './types';
export const getPublicBusinessSite = cache(async (slug: string) => {
  const admin = supabaseAdmin();
  const { data: settings, error } = await admin
    .from('public_site_settings')
    .select('*')
    .ilike('slug', slug.trim())
    .eq('enabled', true)
    .maybeSingle();
  if (error || !settings) return null;
  const [account, services, team, portal, whatsappConfig] = await Promise.all([
    admin
      .from('accounts')
      .select('id,name,logo_url,default_currency')
      .eq('id', settings.account_id)
      .single(),
    admin
      .from('clinic_services')
      .select('id,name,description,public_presentation,public_benefits,public_considerations,public_image_url,duration_minutes,price,currency,color,coming_soon')
      .eq('account_id', settings.account_id)
      .eq('is_active', true)
      .eq('online_enabled', true)
      .order('name')
      .limit(24),
    admin
      .from('profiles')
      .select(
        'id,full_name,avatar_url,professional_title,professional_bio,professional_color,professional_public_slug,working_hours'
      )
      .eq('account_id', settings.account_id)
      .eq('is_professional', true)
      .eq('professional_show_online', true)
      .order('full_name')
      .limit(24),
    admin
      .from('client_portal_settings')
      .select('slug,enabled,booking_enabled')
      .eq('account_id', settings.account_id)
      .maybeSingle(),
    admin
      .from('whatsapp_config')
      .select('status,user_id')
      .eq('account_id', settings.account_id)
      .maybeSingle(),
  ]);
  if (account.error) return null;
  let whatsappConnected = whatsappConfig.data?.status === 'connected';
  if (remoteWhatsAppWorker.enabled()) {
    try {
      const status = await Promise.race([
        remoteWhatsAppWorker.status({ accountId: settings.account_id, userId: whatsappConfig.data?.user_id || await resolveAuditUserId(admin, settings.account_id), autoStart: false }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_200)),
      ]);
      whatsappConnected = status.connected === true;
    } catch { whatsappConnected = false; }
  }
  return {
    settings: settings as PublicSiteSettings,
    account: account.data,
    services: services.data ?? [],
    team: team.data ?? [],
    portal: portal.data?.enabled ? portal.data : null,
    whatsappConnected,
  };
});

export const getDefaultPublicBusinessSlug = cache(async () => {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from('public_site_settings')
    .select('slug')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.slug || null;
});

import { cache } from 'react';
import { supabaseAdmin } from '@/lib/flows/admin-client';
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
  const [account, services, team, portal] = await Promise.all([
    admin
      .from('accounts')
      .select('id,name,logo_url,default_currency')
      .eq('id', settings.account_id)
      .single(),
    admin
      .from('clinic_services')
      .select('id,name,description,duration_minutes,price,currency,color')
      .eq('account_id', settings.account_id)
      .eq('is_active', true)
      .eq('online_enabled', true)
      .order('name')
      .limit(24),
    admin
      .from('profiles')
      .select(
        'id,full_name,avatar_url,professional_title,professional_bio,professional_color'
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
  ]);
  if (account.error) return null;
  return {
    settings: settings as PublicSiteSettings,
    account: account.data,
    services: services.data ?? [],
    team: team.data ?? [],
    portal: portal.data?.enabled ? portal.data : null,
  };
});

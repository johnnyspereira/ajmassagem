'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Settings2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { GeneralSettings } from '@/components/settings/general-settings';
import { ProfileForm } from '@/components/settings/profile-form';
import { WorkTimePanel } from '@/components/settings/work-time-panel';
import { ClinicSettings } from '@/components/settings/clinic-settings';
import { ClientPortalSettings } from '@/components/settings/client-portal-settings';
import { SecurityPanel } from '@/components/settings/security-panel';
import { PrivacyCompliancePanel } from '@/components/settings/privacy-compliance-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { AutomatedMessagesSettings } from '@/components/settings/automated-messages-settings';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { ReferralSettings } from '@/components/settings/referral-settings';
import { RolesAccessPanel } from '@/components/settings/roles-access-panel';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { DataCleanupPanel } from '@/components/settings/data-cleanup-panel';
import { NewFeaturesSettings } from '@/components/settings/new-features-settings';
import {
  getVisibleSettingsSections,
  resolveAllowedSection,
  resolveSection,
  SECTION_META,
  type SettingsSection,
} from '@/components/settings/settings-sections';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accountRole, defaultCurrency, profileLoading } = useAuth();
  const { mode } = useTheme();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const rawTab = searchParams.get('tab');
  const section = profileLoading
    ? 'overview'
    : resolveAllowedSection(rawTab, accountRole);
  const visibleSections = useMemo(
    () => getVisibleSettingsSections(accountRole),
    [accountRole]
  );

  useEffect(() => {
    if (profileLoading) return;
    const requested = resolveSection(rawTab);
    if (requested === section && rawTab) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', section);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  }, [accountRole, profileLoading, rawTab, router, searchParams, section]);

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: t(`appearance.modeLabel.${mode}`),
      general: t('railHints.identity'),
      'work-time': t('railHints.clock'),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency, t]
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    general: <GeneralSettings />,
    profile: <ProfileForm />,
    'work-time': <WorkTimePanel />,
    clinic: <ClinicSettings />,
    portal: <ClientPortalSettings />,
    security: <SecurityPanel />,
    privacy: <PrivacyCompliancePanel />,
    appearance: <AppearancePanel />,
    whatsapp: <WhatsAppConfig />,
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    'automated-messages': <AutomatedMessagesSettings />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    referrals: <ReferralSettings />,
    roles: <RolesAccessPanel onSelect={go} />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
    'data-cleanup': <DataCleanupPanel />,
    'new-features': <NewFeaturesSettings />,
  };
  const activeMeta = SECTION_META[section];

  return (
    <div>
      <section className="border-primary/15 from-primary-soft/50 via-card to-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-br p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm"><Settings2 className="size-5" /></span>
          <div className="min-w-0"><p className="text-primary text-xs font-semibold tracking-[0.1em] uppercase">Área de administração</p><h1 className="text-foreground mt-0.5 text-2xl font-bold tracking-tight">{t('pageTitle')}</h1><p className="text-muted-foreground mt-1 text-sm">{t('pageDesc')}</p></div>
        </div>
        <div className="border-border bg-background/75 min-w-44 rounded-xl border px-4 py-3"><p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">A editar agora</p><p className="text-foreground mt-1 text-sm font-semibold">{t(`sections.${activeMeta.id}`)}</p></div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start">
        <SettingsRail
          active={section}
          onSelect={go}
          hints={hints}
          sections={visibleSections}
        />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}

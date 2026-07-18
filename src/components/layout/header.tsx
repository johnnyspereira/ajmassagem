'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ChevronDown,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { WorkTimeClock } from '@/components/work-time/work-time-clock';
import {
  bottomNavItems,
  isNavItemActive,
  navItems,
  type NavItem,
} from './navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { cn } from '@/lib/utils';

const pageTitles: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inbox': 'inbox',
  '/notifications': 'notifications',
  '/agenda': 'agenda',
  '/contacts': 'contacts',
  '/finance': 'finance',
  '/reports': 'reports',
  '/referrals': 'referrals',
  '/pipelines': 'pipelines',
  '/broadcasts': 'broadcasts',
  '/automations': 'automations',
  '/settings': 'settings',
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'dashboard';
}

const topbarDirectHrefs = ['/dashboard', '/agenda'];

const topbarGroupConfigs = [
  {
    labelKey: 'groupService',
    hrefs: ['/inbox', '/notifications', '/contacts'],
  },
  {
    labelKey: 'groupSales',
    hrefs: ['/finance', '/reports', '/referrals'],
  },
  {
    labelKey: 'groupAutomation',
    hrefs: ['/pipelines', '/broadcasts', '/automations', '/flows', '/agents'],
  },
  {
    labelKey: 'groupSystem',
    hrefs: ['/settings'],
  },
] as const;

const headerLabelFallbacks = {
  pt: {
    flows: 'Fluxos',
    aiAgents: 'Agentes de IA',
    reports: 'Relatórios',
    referrals: 'Indicações',
    groupService: 'Atendimento',
    groupSales: 'Comercial',
    groupAutomation: 'Automação',
    groupSystem: 'Sistema',
  },
  en: {
    flows: 'Flows',
    aiAgents: 'AI Agents',
    reports: 'Reports',
    referrals: 'Referrals',
    groupService: 'Service',
    groupSales: 'Sales',
    groupAutomation: 'Automation',
    groupSystem: 'System',
  },
} as const;

interface HeaderProps {
  onOpenSidebar?: () => void;
  navigationLayout?: 'sidebar' | 'topbar';
}

export function Header({
  onOpenSidebar,
  navigationLayout = 'sidebar',
}: HeaderProps) {
  const t = useTranslations('Header');
  const locale = useLocale();
  const labelLocale = locale === 'en' ? 'en' : 'pt';
  const pathname = usePathname();
  const { profile, account, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const titleKey = getPageTitleKey(pathname);
  const allNavItems = [...navItems, ...bottomNavItems];
  const navItemByHref = new Map(allNavItems.map((item) => [item.href, item]));
  const topbarDirectItems = topbarDirectHrefs
    .map((href) => navItemByHref.get(href))
    .filter((item): item is NavItem => Boolean(item));
  const topbarGroups = topbarGroupConfigs
    .map((group) => ({
      ...group,
      items: group.hrefs
        .map((href) => navItemByHref.get(href))
        .filter((item): item is NavItem => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0);

  function getAttentionLabel(item: NavItem) {
    if (item.href === '/inbox' && totalUnread > 0) {
      return totalUnread > 9 ? '9+' : String(totalUnread);
    }
    if (item.href === '/notifications' && unreadNotifications > 0) {
      return unreadNotifications > 9 ? '9+' : String(unreadNotifications);
    }
    return null;
  }

  function getHeaderLabel(key: string) {
    return (
      headerLabelFallbacks[labelLocale][
        key as keyof (typeof headerLabelFallbacks)['pt']
      ] ?? t(key)
    );
  }

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    'U';

  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t('openMenu')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1
          className={cn(
            'text-foreground truncate text-base font-semibold sm:text-lg',
            navigationLayout === 'topbar' && 'lg:hidden'
          )}
        >
          {t(titleKey as string)}
        </h1>
      </div>

      {navigationLayout === 'topbar' && (
        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-visible px-2 lg:flex">
          <Link
            href="/dashboard"
            className="text-foreground hover:bg-muted mr-1 flex max-w-[clamp(7rem,16vw,14rem)] shrink items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm font-semibold"
            title={account?.name ?? 'CRM'}
          >
            <Avatar className="size-6 rounded-md after:rounded-md">
              {account?.logo_url ? (
                <AvatarImage
                  src={account.logo_url}
                  alt={account.name ?? 'CRM'}
                  className="rounded-md"
                />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground rounded-md text-[10px]">
                {(account?.name ?? 'CRM').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{account?.name ?? 'CRM'}</span>
          </Link>

          {topbarDirectItems.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const attentionLabel = getAttentionLabel(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{t(item.labelKey as string)}</span>
                {attentionLabel && (
                  <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                    {attentionLabel}
                  </span>
                )}
              </Link>
            );
          })}

          {topbarGroups.map((group) => {
            const active = group.items.some((item) =>
              isNavItemActive(pathname, item.href)
            );
            const attentionLabel =
              group.items.map(getAttentionLabel).find(Boolean) ?? null;
            const GroupIcon = group.items[0]?.icon;

            return (
              <DropdownMenu key={group.labelKey}>
                <DropdownMenuTrigger
                  className={cn(
                    'data-popup-open:bg-muted data-popup-open:text-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {GroupIcon ? <GroupIcon className="h-3.5 w-3.5" /> : null}
                  {getHeaderLabel(group.labelKey)}
                  {attentionLabel && (
                    <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                      {attentionLabel}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="w-56"
                >
                  {group.items.map((item) => {
                    const itemActive = isNavItemActive(pathname, item.href);
                    const itemAttentionLabel = getAttentionLabel(item);
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        render={<Link href={item.href} />}
                        className={cn(
                          'h-9 cursor-pointer justify-between gap-2 px-2',
                          itemActive && 'bg-primary/10 text-primary'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <item.icon className="size-4" />
                          <span className="truncate">
                            {getHeaderLabel(item.labelKey)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {item.beta && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[8px] font-semibold text-amber-500 uppercase">
                              Beta
                            </span>
                          )}
                          {itemAttentionLabel && (
                            <span className="bg-primary text-primary-foreground flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold">
                              {itemAttentionLabel}
                            </span>
                          )}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      )}

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <WorkTimeClock />
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-muted/70 focus:bg-muted/70 data-popup-open:bg-muted/70 flex items-center gap-2 rounded-md px-1 py-1 transition-colors focus:outline-none sm:gap-3 sm:pr-3 sm:pl-1"
            aria-label={t('openAccountMenu')}
          >
            <Avatar className="size-8">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t('defaultAvatar')}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'text-foreground hidden text-sm font-medium whitespace-nowrap sm:inline'
              )}
            >
              {profile?.full_name ?? t('defaultUser')}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="bg-popover text-popover-foreground ring-border min-w-56"
          >
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-medium">
                {profile?.full_name ?? t('defaultUser')}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {profile?.email ?? ''}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <User className="size-4" />
              {t('menuProfile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=general"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              {t('menuSettings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <LogOut className="size-4" />
              {t('menuSignOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, Menu, LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ModeToggle } from './mode-toggle';
import { NavigationSearch } from './navigation-search';
import { AccountClock } from './account-clock';
import { navigationGroups, activeNavigation } from './navigation-model';
import { useNavigationCounts } from './navigation-state';
import { WorkTimeClock } from '@/components/work-time/work-time-clock';
export function Header({
  onOpenSidebar,
  drawerMenu = false,
}: {
  onOpenSidebar?: () => void;
  drawerMenu?: boolean;
}) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const counts = useNavigationCounts();
  const active = activeNavigation(pathname);
  const group = navigationGroups.find((item) =>
    item.hrefs.includes(active?.href || '')
  );
  return (
    <header className="border-border bg-card/95 z-30 shrink-0 border-b backdrop-blur">
      <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Abrir menu"
            className={cn(
              'text-muted-foreground hover:bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl',
              !drawerMenu && 'lg:hidden'
            )}
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="text-muted-foreground hidden text-[10px] tracking-wider uppercase sm:block">
              {group?.label || 'Espaço de trabalho'}
            </p>
            <p className="truncate text-sm font-semibold">
              {pathname === '/notifications'
                ? 'Notificações'
                : active?.label || 'JP Massagem'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <NavigationSearch />
          <AccountClock />
          <div className="border-border mx-2 hidden border-r pr-3 2xl:block">
            <WorkTimeClock />
          </div>
          <Link
            href="/notifications"
            aria-label={
              counts.notifications
                ? `Notificações: ${counts.notifications} por ler`
                : 'Notificações'
            }
            title="Notificações"
            aria-current={pathname === '/notifications' ? 'page' : undefined}
            className={cn(
              'text-muted-foreground hover:bg-muted relative flex size-10 items-center justify-center rounded-xl',
              pathname === '/notifications' && 'bg-primary/10 text-primary'
            )}
          >
            <Bell className="size-[19px]" />
            {counts.notifications > 0 && (
              <span className="bg-primary ring-card absolute top-2 right-2 size-1.5 rounded-full ring-2" />
            )}
          </Link>
          <ModeToggle className="rounded-xl" />
          <div className="border-border ml-1 border-l pl-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Abrir menu da conta"
                className="hover:bg-muted flex items-center gap-2 rounded-xl p-1"
              >
                <Avatar className="size-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(profile?.full_name || 'JP').slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="text-muted-foreground hidden size-3 sm:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-2xl p-2">
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-semibold">
                    {profile?.full_name || 'A sua conta'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {profile?.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={<Link href="/settings?tab=profile" />}
                >
                  <User className="size-4" />O meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings" />}>
                  <Settings className="size-4" />
                  Definições
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/settings?tab=work-time" />}
                >
                  Jornada de trabalho
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<Link href="/settings?tab=updates" />}
                >
                  Atualizações do sistema
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="size-4" />
                  Terminar sessão
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PresenceHeartbeat } from '@/components/presence/presence-heartbeat';
import { InboxFloatingAlerts } from '@/components/inbox/inbox-floating-alerts';
import { NotificationRealtimeAlerts } from '@/components/notifications/notification-realtime-alerts';
import { PushNotifications } from '@/components/notifications/push-notifications';
import { WorkTimeProvider } from '@/components/work-time/work-time-provider';
import { DocumentTitle } from '@/components/layout/document-title';
import { ContextualHelp } from '@/components/support/contextual-help';
import { MobileAppNavigation } from '@/components/layout/mobile-app-navigation';
import { NavigationState } from '@/components/layout/navigation-state';
import agendaStyles from '@/components/agenda/agenda-workspace.module.css';

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Inbox is intentionally a focused workspace, not another dashboard
  // panel. Keep its navigation available in a drawer so conversations have
  // the full width while the agent can still reach every CRM tool.
  // `usePathname` can transiently return null while a client navigation is
  // hydrating. Treat that state as the normal dashboard shell instead of
  // allowing a string call to take down every authenticated route.
  const isInboxWorkspace = pathname?.startsWith('/inbox') ?? false;
  const isAgendaWorkspace = pathname === '/agenda';

  // Drawer on mobile and at every screen size inside the Inbox.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <WorkTimeProvider>
      <NavigationState>
        <DocumentTitle />
        <div className="bg-background flex h-dvh overflow-hidden">
          {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
          <PresenceHeartbeat />
          <InboxFloatingAlerts />
          <NotificationRealtimeAlerts />
          <PushNotifications />
          <ContextualHelp />
          <Sidebar
            open={sidebarOpen}
            onClose={closeSidebar}
            drawerOnly={isInboxWorkspace}
          />
          {!isInboxWorkspace && (
            <>
              {!isAgendaWorkspace && (
                <Link
                  href="/finance?tab=pos"
                  aria-label="Abrir ponto de venda"
                  title="Abrir POS"
                  className="bg-primary text-primary-foreground hover:bg-primary-hover fixed right-5 bottom-24 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 sm:right-5 sm:bottom-5"
                >
                  <ShoppingCart className="size-5" />
                  <span className="sr-only">Abrir POS</span>
                </Link>
              )}
              <div
                className={
                  isAgendaWorkspace ? agendaStyles.mobileNavigation : undefined
                }
              >
                <MobileAppNavigation onOpenMenu={() => setSidebarOpen(true)} />
              </div>
            </>
          )}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Header
              onOpenSidebar={() => setSidebarOpen(true)}
              drawerMenu={isInboxWorkspace}
            />
            <main
              data-agenda-workspace={isAgendaWorkspace || undefined}
              className={
                isInboxWorkspace
                  ? 'min-h-0 flex-1 overflow-hidden'
                  : isAgendaWorkspace
                    ? `${agendaStyles.agendaMain} min-h-0 flex-1 overflow-hidden p-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:pb-4`
                    : 'flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28'
              }
            >
              {children}
            </main>
          </div>
        </div>
      </NavigationState>
    </WorkTimeProvider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}

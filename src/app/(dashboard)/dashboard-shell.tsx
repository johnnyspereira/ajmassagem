'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading, account } = useAuth();
  const router = useRouter();
  const navigationLayout = account?.navigation_layout ?? 'sidebar';

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
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
      <DocumentTitle />
      <div className="bg-background flex h-screen overflow-hidden">
        {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
        <PresenceHeartbeat />
        <InboxFloatingAlerts />
        <NotificationRealtimeAlerts />
        <PushNotifications />
        <ContextualHelp />
        <div
          className={navigationLayout === 'topbar' ? 'lg:hidden' : 'contents'}
        >
          <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            onOpenSidebar={() => setSidebarOpen(true)}
            navigationLayout={navigationLayout}
          />
          {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
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

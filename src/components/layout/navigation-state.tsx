'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { useTotalUnread } from '@/hooks/use-total-unread';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
const Context = createContext({ inbox: 0, notifications: 0 });
function CountsProvider({ children }: { children: ReactNode }) {
  const inbox = useTotalUnread();
  const notifications = useUnreadNotifications();
  return (
    <Context.Provider value={{ inbox, notifications }}>
      {children}
    </Context.Provider>
  );
}
export function NavigationState({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  return enabled ? <CountsProvider>{children}</CountsProvider> : children;
}
export const useNavigationCounts = () => useContext(Context);

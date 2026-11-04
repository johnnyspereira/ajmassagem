'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
export function AccessTracker() {
  const path = usePathname();
  const { accountId } = useAuth();
  useEffect(() => {
    if (!accountId || !path) return;
    const record = () => {
      if (document.visibilityState === 'visible')
        void fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        }).catch(() => {});
    };
    record();
    const timer = setInterval(record, 300000);
    document.addEventListener('visibilitychange', record);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', record);
    };
  }, [accountId, path]);
  return null;
}

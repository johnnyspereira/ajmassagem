'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { accountDateInput, accountTimeInput } from '@/lib/timezone';

export function AccountClock() {
  const { account } = useAuth();
  const [now, setNow] = useState<Date | null>(null);
  const zone = account?.timezone || 'Europe/Lisbon';
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  const date = now
    ? accountDateInput(now, zone).split('-').reverse().join('/')
    : '—';
  return (
    <time
      dateTime={now?.toISOString()}
      title={`Data e hora · ${zone}`}
      aria-label={`Data e hora em ${zone}: ${date} ${now ? accountTimeInput(now, zone) : ''}`}
      className="mx-1 flex shrink-0 flex-col items-end px-1 tabular-nums sm:mx-2 sm:px-2"
    >
      <span className="text-xs font-semibold sm:text-sm">
        {now ? accountTimeInput(now, zone) : '—:—'}
      </span>
      <span className="text-muted-foreground text-[9px] sm:text-[10px]">
        {date}
      </span>
    </time>
  );
}

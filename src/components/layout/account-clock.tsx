'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Clock3 } from 'lucide-react';
import {
  accountDateInput,
  accountTimeInput,
  accountWeekday,
} from '@/lib/timezone';

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
      className="mx-1 flex shrink-0 items-center gap-2 px-1 tabular-nums sm:mx-2 sm:px-2"
    >
      <Clock3
        aria-hidden="true"
        className="text-muted-foreground hidden size-4 sm:block"
      />
      <span className="flex flex-col items-end gap-0.5">
        <span className="text-[10px] font-medium capitalize sm:text-xs">
          {now ? accountWeekday(now, zone) : '—'}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] sm:text-[10px]">
          <Clock3 aria-hidden="true" className="size-3 sm:hidden" />
          <span className="text-xs font-semibold">
            {now ? accountTimeInput(now, zone) : '—:—'}
          </span>
          <span className="text-muted-foreground">{date}</span>
        </span>
      </span>
    </time>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'wacrm.hiddenNewFeatureBadges.v1';

function readHiddenBadges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

interface NewFeatureBadgeProps {
  badge: {
    key: string;
    label?: string;
    className?: string;
  };
  compact?: boolean;
}

export function NewFeatureBadge({ badge, compact }: NewFeatureBadgeProps) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(readHiddenBadges().includes(badge.key));
  }, [badge.key]);

  function hideBadge(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const next = [...new Set([...readHiddenBadges(), badge.key])];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black tracking-[0.16em] uppercase',
        badge.className ??
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
        compact && 'px-1 py-0 text-[8px]'
      )}
      title="Nova funcionalidade"
    >
      {badge.label ?? 'NOVO'}
      <button
        type="button"
        aria-label="Ocultar novidade"
        onClick={hideBadge}
        className="rounded-full opacity-70 transition hover:bg-current/10 hover:opacity-100"
      >
        <X className={compact ? 'size-2.5' : 'size-3'} />
      </button>
    </span>
  );
}

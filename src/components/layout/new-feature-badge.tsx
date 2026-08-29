'use client';

import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NEW_FEATURE_HIDDEN_STORAGE_KEY =
  'wacrm.hiddenNewFeatureBadges.v1';
export const NEW_FEATURE_SETTINGS_STORAGE_KEY =
  'wacrm.newFeatureBadgeSettings.v1';

export const NEW_FEATURE_BADGE_STYLES = {
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.16)]',
  amber:
    'border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.14)]',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300 shadow-[0_0_18px_rgba(14,165,233,0.14)]',
  violet:
    'border-violet-500/40 bg-violet-500/10 text-violet-300 shadow-[0_0_18px_rgba(139,92,246,0.14)]',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.14)]',
} as const;

export type NewFeatureBadgeStyle = keyof typeof NEW_FEATURE_BADGE_STYLES;

export interface NewFeatureBadgeSettings {
  label: string;
  style: NewFeatureBadgeStyle;
}

export const DEFAULT_NEW_FEATURE_BADGE_SETTINGS: NewFeatureBadgeSettings = {
  label: 'NOVO',
  style: 'emerald',
};

function readHiddenBadges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(NEW_FEATURE_HIDDEN_STORAGE_KEY) ?? '[]'
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function readNewFeatureBadgeSettings(): NewFeatureBadgeSettings {
  if (typeof window === 'undefined') return DEFAULT_NEW_FEATURE_BADGE_SETTINGS;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(NEW_FEATURE_SETTINGS_STORAGE_KEY) ?? '{}'
    ) as Partial<NewFeatureBadgeSettings>;
    return {
      label:
        typeof parsed.label === 'string' && parsed.label.trim()
          ? parsed.label.trim().slice(0, 14)
          : DEFAULT_NEW_FEATURE_BADGE_SETTINGS.label,
      style:
        parsed.style && parsed.style in NEW_FEATURE_BADGE_STYLES
          ? parsed.style
          : DEFAULT_NEW_FEATURE_BADGE_SETTINGS.style,
    };
  } catch {
    return DEFAULT_NEW_FEATURE_BADGE_SETTINGS;
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
  const [settings, setSettings] = useState<NewFeatureBadgeSettings>(
    DEFAULT_NEW_FEATURE_BADGE_SETTINGS
  );

  useEffect(() => {
    // Hydrate browser-persisted preferences after the component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHiddenBadges().includes(badge.key));
    setSettings(readNewFeatureBadgeSettings());

    const onStorage = () => {
      setHidden(readHiddenBadges().includes(badge.key));
      setSettings(readNewFeatureBadgeSettings());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('wacrm:new-feature-badges-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('wacrm:new-feature-badges-changed', onStorage);
    };
  }, [badge.key]);

  function hideBadge(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const next = [...new Set([...readHiddenBadges(), badge.key])];
    window.localStorage.setItem(
      NEW_FEATURE_HIDDEN_STORAGE_KEY,
      JSON.stringify(next)
    );
    window.dispatchEvent(new Event('wacrm:new-feature-badges-changed'));
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black tracking-[0.16em] uppercase',
        NEW_FEATURE_BADGE_STYLES[settings.style],
        compact && 'px-1 py-0 text-[8px]'
      )}
      title="Nova funcionalidade"
    >
      {settings.label || badge.label || 'NOVO'}
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

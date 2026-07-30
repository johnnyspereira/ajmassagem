'use client';

import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_NEW_FEATURE_BADGE_SETTINGS,
  NEW_FEATURE_BADGE_STYLES,
  NEW_FEATURE_HIDDEN_STORAGE_KEY,
  NEW_FEATURE_SETTINGS_STORAGE_KEY,
  type NewFeatureBadgeSettings,
  readNewFeatureBadgeSettings,
} from '@/components/layout/new-feature-badge';
import { navItems } from '@/components/layout/navigation';
import { cn } from '@/lib/utils';

function readHidden(): string[] {
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

function notifyBadgesChanged() {
  window.dispatchEvent(new Event('wacrm:new-feature-badges-changed'));
}

export function NewFeaturesSettings() {
  const t = useTranslations('Settings.newFeatures');
  const tSidebar = useTranslations('Sidebar');
  const [settings, setSettings] = useState<NewFeatureBadgeSettings>(
    DEFAULT_NEW_FEATURE_BADGE_SETTINGS
  );
  const [hidden, setHidden] = useState<string[]>([]);

  const featureItems = useMemo(
    () => navItems.filter((item) => item.newBadge),
    []
  );

  useEffect(() => {
    setSettings(readNewFeatureBadgeSettings());
    setHidden(readHidden());
  }, []);

  function persistSettings(next: NewFeatureBadgeSettings) {
    setSettings(next);
    window.localStorage.setItem(
      NEW_FEATURE_SETTINGS_STORAGE_KEY,
      JSON.stringify(next)
    );
    notifyBadgesChanged();
  }

  function persistHidden(next: string[]) {
    const unique = [...new Set(next)];
    setHidden(unique);
    window.localStorage.setItem(
      NEW_FEATURE_HIDDEN_STORAGE_KEY,
      JSON.stringify(unique)
    );
    notifyBadgesChanged();
  }

  function resetAll() {
    window.localStorage.removeItem(NEW_FEATURE_SETTINGS_STORAGE_KEY);
    window.localStorage.removeItem(NEW_FEATURE_HIDDEN_STORAGE_KEY);
    setSettings(DEFAULT_NEW_FEATURE_BADGE_SETTINGS);
    setHidden([]);
    notifyBadgesChanged();
    toast.success(t('toastReset'));
  }

  return (
    <section className="border-border bg-card/70 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h2 className="text-foreground text-lg font-semibold">
                {t('title')}
              </h2>
              <p className="text-muted-foreground text-sm">{t('desc')}</p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={resetAll}
          className="border-border text-muted-foreground hover:bg-muted"
        >
          <RotateCcw className="size-4" />
          {t('reset')}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-border bg-background/45 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            {t('customizeTitle')}
          </p>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-muted-foreground text-xs">
                {t('labelText')}
              </span>
              <Input
                value={settings.label}
                maxLength={14}
                onChange={(event) =>
                  persistSettings({
                    ...settings,
                    label: event.target.value.slice(0, 14),
                  })
                }
                placeholder="NOVO"
                className="mt-1"
              />
            </label>

            <div>
              <span className="text-muted-foreground text-xs">
                {t('labelColor')}
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.keys(NEW_FEATURE_BADGE_STYLES).map((style) => {
                  const key = style as keyof typeof NEW_FEATURE_BADGE_STYLES;
                  const active = settings.style === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => persistSettings({ ...settings, style: key })}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-semibold uppercase transition',
                        NEW_FEATURE_BADGE_STYLES[key],
                        active
                          ? 'ring-primary ring-2 ring-offset-2 ring-offset-background'
                          : 'opacity-75 hover:opacity-100'
                      )}
                    >
                      {settings.label || 'NOVO'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="border-border bg-background/45 rounded-xl border p-4">
          <p className="text-foreground text-sm font-medium">
            {t('modulesTitle')}
          </p>
          <div className="mt-3 divide-y divide-border/70">
            {featureItems.map((item) => {
              const key = item.newBadge!.key;
              const isHidden = hidden.includes(key);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <item.icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="text-foreground truncate text-sm font-medium">
                      {tSidebar(item.labelKey as string)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isHidden ? 'outline' : 'secondary'}
                    onClick={() =>
                      persistHidden(
                        isHidden
                          ? hidden.filter((itemKey) => itemKey !== key)
                          : [...hidden, key]
                      )
                    }
                    className="shrink-0"
                  >
                    {isHidden ? t('show') : t('hide')}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

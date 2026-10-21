'use client';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RAIL_GROUPS,
  SECTION_META,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './settings-sections';
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function SettingsRail({
  active,
  onSelect,
  hints,
  sections = SETTINGS_SECTIONS,
}: {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  hints?: Partial<Record<SettingsSection, ReactNode>>;
  sections?: readonly SettingsSection[];
}) {
  const t = useTranslations('Settings');
  const sectionLabel = (section: SettingsSection) =>
    t.has(`sections.${section}`)
      ? t(`sections.${section}`)
      : SECTION_META[section].label;
  const [query, setQuery] = useState('');
  const matching = sections.filter((section) =>
    normalize(
      `${sectionLabel(section)} ${t(`groups.${SECTION_META[section].group}`)} ${t(`groupDesc.${SECTION_META[section].group}`)}`
    ).includes(normalize(query.trim()))
  );
  return (
    <nav
      aria-label="Áreas das definições"
      className="bg-card min-w-0 rounded-2xl border xl:sticky xl:top-4"
    >
      <div className="p-3 xl:hidden">
        <label
          htmlFor="settings-area"
          className="text-muted-foreground mb-2 block text-xs font-medium"
        >
          Escolher área das definições
        </label>
        <select
          id="settings-area"
          value={active}
          onChange={(event) => onSelect(event.target.value as SettingsSection)}
          className="bg-background h-11 w-full min-w-0 rounded-xl border px-3 text-sm"
        >
          {RAIL_GROUPS.map(({ group }) => {
            const items = sections.filter(
              (section) => SECTION_META[section].group === group
            );
            return items.length ? (
              <optgroup key={group} label={t(`groups.${group}`)}>
                {items.map((section) => (
                  <option key={section} value={section}>
                    {sectionLabel(section)}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      <div className="hidden xl:block">
        <div className="border-b p-3">
          <p className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
            <Settings2 className="text-primary size-4" />
            Navegar nas definições
          </p>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4" />
            <input
              aria-label="Pesquisar área das definições"
              placeholder="Pesquisar definições…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="bg-background h-10 w-full rounded-xl border pr-3 pl-9 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[calc(100dvh-240px)] [scrollbar-width:thin] space-y-4 overflow-y-auto overscroll-contain p-3">
          {!matching.length && (
            <p role="status" className="text-muted-foreground p-3 text-sm">
              Nenhuma área encontrada.
            </p>
          )}
          {RAIL_GROUPS.map(({ group }) => {
            const items = matching.filter(
              (section) => SECTION_META[section].group === group
            );
            return items.length ? (
              <section key={group}>
                <h2 className="text-muted-foreground mb-1.5 px-2 text-[10px] font-semibold tracking-widest uppercase">
                  {t(`groups.${group}`)}
                </h2>
                <div className="space-y-1">
                  {items.map((section) => {
                    const Icon = SECTION_META[section].icon;
                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => onSelect(section)}
                        aria-current={section === active ? 'page' : undefined}
                        className={cn(
                          'focus-visible:outline-primary flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2',
                          section === active
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 break-words">
                          {sectionLabel(section)}
                        </span>
                        {hints?.[section] != null && (
                          <span className="bg-muted shrink-0 rounded-md px-1.5 py-0.5 text-[10px]">
                            {hints[section]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null;
          })}
        </div>
      </div>
    </nav>
  );
}

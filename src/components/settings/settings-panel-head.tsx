import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Section header shown at the top of every settings panel — a title,
 * a one-line description, and an optional right-aligned action (e.g.
 * "New template", "Invite member"). Mirrors the mockup's `.panel-head`.
 */
export function SettingsPanelHead({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mt-1 max-w-[62ch] text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap gap-2 [&>button]:min-h-10">
          {action}
        </div>
      ) : null}
    </div>
  );
}

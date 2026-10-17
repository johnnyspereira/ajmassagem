'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  navigationGroups,
  groupLinks,
  activeNavigation,
} from './navigation-model';
import { useNavigationCounts } from './navigation-state';
export function Sidebar({
  open = false,
  onClose,
  drawerOnly = false,
}: {
  open?: boolean;
  onClose?: () => void;
  drawerOnly?: boolean;
}) {
  const pathname = usePathname();
  const { account } = useAuth();
  const counts = useNavigationCounts();
  const [compact, setCompact] = useState(false);
  const active = activeNavigation(pathname);
  const [expanded, setExpanded] = useState<string[]>(['daily']);
  function content(drawer = false) {
    const small = compact && !drawer;
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-20 shrink-0 items-center gap-3 px-5">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex min-w-0 items-center gap-3"
          >
            <Image
              src={account?.logo_url || '/icons/jp-massagem-64-v1.png'}
              alt=""
              width={38}
              height={38}
              unoptimized
              className="size-9 shrink-0 rounded-xl object-contain"
            />
            {!small && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {account?.name || 'JP Massagem'}
                </span>
                <span className="text-muted-foreground text-[10px] tracking-[.16em] uppercase">
                  O seu espaço de trabalho
                </span>
              </span>
            )}
          </Link>
        </div>
        <div className="px-3 pb-4">
          <Link
            href="/agenda?new=1"
            onClick={onClose}
            title="Nova marcação"
            className={cn(
              'bg-primary text-primary-foreground flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm',
              small && 'px-0'
            )}
          >
            <Plus className="size-4" />
            {!small && 'Nova marcação'}
          </Link>
        </div>
        <nav
          aria-label="Navegação principal"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4"
        >
          {navigationGroups.map((group) => {
            const links = groupLinks(group.id);
            const selected = links.some((item) => item.href === active?.href);
            const shown = small || expanded.includes(group.id) || selected;
            return (
              <section key={group.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) =>
                      current.includes(group.id)
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id]
                    )
                  }
                  aria-expanded={shown}
                  className={cn(
                    'text-muted-foreground flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold tracking-[.13em] uppercase',
                    small && 'justify-center px-0'
                  )}
                  title={group.label}
                >
                  {small ? (
                    <span className="bg-border h-px w-6" />
                  ) : (
                    <>
                      {group.label}
                      <ChevronDown
                        className={cn(
                          'ml-auto size-3 transition-transform',
                          shown && 'rotate-180'
                        )}
                      />
                    </>
                  )}
                </button>
                {shown && (
                  <div className="space-y-0.5">
                    {links.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        onClick={onClose}
                        aria-current={
                          active?.href === item.href ? 'page' : undefined
                        }
                        className={cn(
                          'group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors',
                          small && 'justify-center px-0',
                          active?.href === item.href
                            ? 'bg-primary/10 text-primary ring-primary/15 ring-1'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <item.icon className="size-[18px] shrink-0" />
                        {!small && (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            {item.href === '/inbox' && counts.inbox > 0 && (
                              <span className="bg-primary/10 text-primary rounded-md px-1.5 text-[10px]">
                                {counts.inbox > 99 ? '99+' : counts.inbox}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
        <footer className="border-border shrink-0 border-t p-3">
          {!small && (
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:bg-muted mb-2 flex items-center justify-between rounded-xl px-3 py-2 text-xs"
            >
              Visitar o site
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
          {!drawer && (
            <button
              type="button"
              onClick={() => setCompact((current) => !current)}
              aria-label={small ? 'Expandir menu' : 'Recolher menu'}
              className="text-muted-foreground hover:bg-muted flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs"
            >
              {small ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <>
                  <PanelLeftClose className="size-4" />
                  Recolher menu
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    );
  }
  return (
    <>
      {!drawerOnly && (
        <aside
          className={cn(
            'border-border bg-card hidden shrink-0 border-r transition-[width] duration-200 lg:block',
            compact ? 'w-20' : 'w-[264px]'
          )}
        >
          {content()}
        </aside>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) onClose?.();
        }}
      >
        <DialogContent className="inset-y-0 top-0 left-0 flex h-dvh w-[300px] max-w-[90vw] translate-x-0 translate-y-0 flex-col rounded-none p-0 sm:max-w-[300px]">
          <DialogTitle className="sr-only">Menu principal</DialogTitle>
          <DialogDescription className="sr-only">
            Áreas do espaço de trabalho
          </DialogDescription>
          {content(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}

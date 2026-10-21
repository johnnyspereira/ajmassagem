'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import {
  navigationGroups,
  groupLinks,
  activeNavigation,
  navigationLinks,
} from './navigation-model';
import { useNavigationCounts } from './navigation-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function TopNavigation() {
  const path = usePathname();
  const active = activeNavigation(path);
  const counts = useNavigationCounts();
  const primaryLinks = [
    ...groupLinks('daily'),
    ...navigationLinks.filter((item) => item.href === '/finance'),
  ];
  return (
    <nav
      aria-label="Navegação superior"
      className="bg-card hidden shrink-0 flex-wrap items-center gap-1 border-b px-4 py-2 lg:flex"
    >
      {primaryLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active?.href === item.href ? 'page' : undefined}
          className={cn(
            'focus-visible:outline-primary inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm whitespace-nowrap transition-colors focus-visible:outline-2',
            active?.href === item.href
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <item.icon className="size-4" />
          {item.label}
          {item.href === '/inbox' && counts.inbox > 0 && (
            <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {counts.inbox > 99 ? '99+' : counts.inbox}
            </span>
          )}
        </Link>
      ))}
      <span className="mx-2 h-5 border-l" />
      {navigationGroups
        .filter((group) => group.id !== 'daily')
        .map((group) => (
          <DropdownMenu key={group.id}>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted data-popup-open:bg-muted inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm whitespace-nowrap transition-colors',
                group.hrefs
                  .filter((href) => href !== '/finance')
                  .includes(active?.href || '')
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {group.label}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-xl"
            >
              <div className="mb-1 border-b px-3 py-3">
                <p className="text-sm font-semibold">{group.label}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {group.description}
                </p>
              </div>
              {groupLinks(group.id)
                .filter((item) => item.href !== '/finance')
                .map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    className={cn(
                      'min-h-11 cursor-pointer gap-3 rounded-xl px-3 py-2.5',
                      active?.href === item.href && 'bg-primary/10 text-primary'
                    )}
                    render={
                      <Link
                        href={item.href}
                        aria-current={
                          active?.href === item.href ? 'page' : undefined
                        }
                      />
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 leading-snug">
                      {item.label}
                    </span>
                    {active?.href === item.href && (
                      <Check className="size-4 shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
    </nav>
  );
}

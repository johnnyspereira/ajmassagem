'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import {
  navigationGroups,
  groupLinks,
  activeNavigation,
} from './navigation-model';
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
  return (
    <nav
      aria-label="Navegação superior"
      className="bg-card hidden shrink-0 flex-wrap items-center gap-1 border-b px-4 py-2 lg:flex"
    >
      {groupLinks('daily').map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active?.href === item.href ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm',
            active?.href === item.href
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
      <span className="mx-2 h-5 border-l" />
      {navigationGroups
        .filter((group) => group.id !== 'daily')
        .map((group) => (
          <DropdownMenu key={group.id}>
            <DropdownMenuTrigger
              className={cn(
                'hover:bg-muted inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm',
                group.hrefs.includes(active?.href || '')
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {group.label}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {groupLinks(group.id).map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  render={
                    <Link
                      href={item.href}
                      aria-current={
                        active?.href === item.href ? 'page' : undefined
                      }
                    />
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
    </nav>
  );
}

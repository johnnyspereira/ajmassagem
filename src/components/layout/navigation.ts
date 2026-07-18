import {
  Bell,
  BadgeEuro,
  BarChart3,
  Bot,
  CalendarDays,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  HeartHandshake,
  Radio,
  Settings,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
}

export const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
  { href: '/notifications', labelKey: 'notifications', icon: Bell },
  { href: '/agenda', labelKey: 'agenda', icon: CalendarDays },
  { href: '/contacts', labelKey: 'contacts', icon: Users },
  { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch },
  { href: '/finance', labelKey: 'finance', icon: BadgeEuro },
  { href: '/reports', labelKey: 'reports', icon: BarChart3 },
  { href: '/referrals', labelKey: 'referrals', icon: HeartHandshake },
  { href: '/broadcasts', labelKey: 'broadcasts', icon: Radio },
  { href: '/automations', labelKey: 'automations', icon: Zap },
  { href: '/flows', labelKey: 'flows', icon: Workflow, beta: true },
  { href: '/agents', labelKey: 'aiAgents', icon: Bot },
];

export const bottomNavItems: NavItem[] = [
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return (
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  );
}

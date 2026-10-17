import { navItems, bottomNavItems } from './navigation';
export const navigationGroups = [
  {
    id: 'daily',
    label: 'O meu dia',
    description: 'Atendimento e organização',
    hrefs: ['/dashboard', '/inbox', '/agenda', '/contacts', '/tasks'],
  },
  {
    id: 'business',
    label: 'Negócio',
    description: 'Vendas, benefícios e resultados',
    hrefs: [
      '/finance',
      '/pipelines',
      '/benefits',
      '/reports',
      '/business-hub',
      '/business-hub/goals',
      '/referrals',
      '/avaliacoes',
    ],
  },
  {
    id: 'marketing',
    label: 'Comunicação',
    description: 'Campanhas, públicos e conteúdos',
    hrefs: [
      '/broadcasts',
      '/scheduled-messages',
      '/social-planner',
      '/portal-campaigns',
      '/segments',
      '/library',
    ],
  },
  {
    id: 'automation',
    label: 'Automação',
    description: 'Fluxos e inteligência artificial',
    hrefs: ['/automations', '/flows', '/agents'],
  },
  {
    id: 'system',
    label: 'Espaço de trabalho',
    description: 'Site, definições e apoio',
    hrefs: ['/website', '/settings', '/system-health', '/support', '/help'],
  },
];
const labels: Record<string, string> = {
  '/dashboard': 'Painel',
  '/inbox': 'Caixa de entrada',
  '/agenda': 'Agenda',
  '/contacts': 'Clientes',
  '/tasks': 'Tarefas',
  '/finance': 'Financeiro',
  '/pipelines': 'Oportunidades',
  '/benefits': 'Vouchers e packs',
  '/reports': 'Relatórios',
  '/business-hub': 'Gestão do negócio',
  '/business-hub/goals': 'Objetivos',
  '/referrals': 'Indicações',
  '/avaliacoes': 'Avaliações',
  '/broadcasts': 'Campanhas de mensagens',
  '/scheduled-messages': 'Mensagens agendadas',
  '/social-planner': 'Redes sociais',
  '/portal-campaigns': 'Campanhas do portal',
  '/segments': 'Segmentos',
  '/library': 'Biblioteca',
  '/automations': 'Automações',
  '/flows': 'Fluxos',
  '/agents': 'Assistentes de IA',
  '/website': 'Site público',
  '/settings': 'Definições',
  '/system-health': 'Estado do sistema',
  '/support': 'Suporte',
  '/help': 'Centro de ajuda',
};
export const navigationLinks = [...navItems, ...bottomNavItems]
  .filter((item) => item.href !== '/notifications')
  .map((item) => ({ ...item, label: labels[item.href] || item.labelKey }));
export function activeNavigation(path: string) {
  return [...navigationLinks]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => path === item.href || path.startsWith(item.href + '/'));
}
export function groupLinks(id: string) {
  const group = navigationGroups.find((item) => item.id === id);
  return (group?.hrefs ?? [])
    .map((href) => navigationLinks.find((item) => item.href === href))
    .filter((item) => item !== undefined);
}

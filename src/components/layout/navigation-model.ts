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
      '/leads',
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
  '/leads': 'Leads',
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

const searchAliases: Record<string, string> = {
  '/inbox':
    'whatsapp mensagens conversas chat atendimento inbox responder imagens audio pdf anexos',
  '/contacts': 'contactos pessoas clientes telefone contactos',
  '/agenda': 'calendario reservas marcacoes agendamentos horarios',
  '/finance': 'pagamentos vendas caixa pos faturas despesas receitas dinheiro',
  '/benefits': 'voucher vouchers packs pacotes presentes',
  '/pipelines': 'crm negocios funil vendas',
  '/leads': 'leads potenciais clientes reativar acompanhamento por agendar beneficios',
  '/automations': 'automatizar regras gatilhos',
  '/flows': 'chatbot bot fluxo whatsapp',
  '/agents': 'ia ai inteligencia artificial assistentes',
  '/settings': 'configuracoes preferencias ajustes conta perfil tema aparencia',
  '/library': 'ficheiros documentos imagens arquivos biblioteca',
  '/broadcasts': 'whatsapp envio massa campanhas transmissao',
};

export function searchableGroupLinks(id: string, query: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  const settings = navigationLinks.find((item) => item.href === '/settings');
  const extras =
    id === 'system' && settings
      ? [
          {
            ...settings,
            href: '/settings?tab=whatsapp',
            label: 'WhatsApp — ligação e configuração',
          },
          {
            ...settings,
            href: '/settings?tab=updates',
            label: 'Atualizações do sistema',
          },
          {
            ...settings,
            href: '/settings?tab=link-previews',
            label: 'Partilha de links',
          },
          {
            ...settings,
            href: '/settings?tab=work-time',
            label: 'Jornada de trabalho — ponto',
          },
        ]
      : [];
  return [...groupLinks(id), ...extras].filter((item) => {
    const haystack = normalize(
      `${item.label} ${item.href} ${searchAliases[item.href] || ''}`
    );
    return tokens.every((token) => haystack.includes(token));
  });
}

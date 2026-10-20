export interface LinkPreview {
  path: string;
  title: string;
  description: string;
  public: boolean;
  sensitive?: boolean;
}

// Copy for every page family. Dynamic values are resolved only from public site data.
const entries: Array<[string, string, string, boolean?, boolean?]> = [
  [
    '/',
    'JP Massagem — O seu momento de bem-estar',
    'Descubra as massagens e experiências da JP Massagem. Conheça os serviços, escolha o seu momento de cuidado e faça a sua marcação online.',
    true,
  ],
  [
    '/site',
    'JP Massagem — Massagens e bem-estar',
    'Conheça a JP Massagem, explore os serviços e encontre o seu próximo momento de bem-estar.',
    true,
  ],
  [
    '/site/[slug]',
    'Conheça a JP Massagem',
    'Descubra os serviços, a equipa e as informações para preparar a sua visita. Reserve o seu momento de bem-estar online.',
    true,
  ],
  [
    '/servicos/[service]',
    'Massagens e experiências',
    'Conheça esta modalidade, os seus benefícios e os cuidados a considerar. Consulte os detalhes e faça a sua marcação na JP Massagem.',
    true,
  ],
  [
    '/profissionais/[professional]',
    'Conheça o seu profissional',
    'Conheça a apresentação e os horários habituais deste profissional da JP Massagem. Escolha a sua próxima sessão e marque online.',
    true,
  ],
  [
    '/testemunhos',
    'Experiências partilhadas pelos nossos clientes',
    'Leia os testemunhos de clientes da JP Massagem, publicados com autorização, e conheça as suas experiências de atendimento.',
    true,
  ],
  [
    '/privacidade',
    'Política de privacidade',
    'Saiba como a JP Massagem recolhe, utiliza e protege os seus dados pessoais e como pode exercer os seus direitos.',
    true,
  ],
  [
    '/privacy/[slug]',
    'Privacidade e proteção dos seus dados',
    'Consulte a política de privacidade, as finalidades do tratamento de dados e os seus direitos enquanto cliente.',
    true,
  ],
  [
    '/portal',
    'Portal do cliente',
    'O seu espaço na JP Massagem: consulte as suas marcações, acompanhe os seus benefícios e prepare a próxima visita.',
  ],
  [
    '/portal/[slug]',
    'O seu portal de cliente',
    'Aceda ao portal da JP Massagem para gerir as suas marcações e consultar as informações disponíveis para a sua conta.',
  ],
  [
    '/portal?book=1',
    'Marque o seu momento de bem-estar',
    'Escolha o serviço, o profissional e o horário para a sua próxima sessão na JP Massagem. Faça o seu pedido de marcação online.',
  ],
  [
    '/portal?tab=finance',
    'Os seus benefícios e pagamentos',
    'Aceda ao portal de cliente da JP Massagem para consultar os benefícios e as informações financeiras disponíveis para a sua conta.',
  ],
  [
    '/anamnese',
    'Prepare a sua sessão',
    'Preencha a ficha de anamnese da JP Massagem. Partilhe as informações relevantes para um atendimento adaptado ao seu conforto.',
  ],
  [
    '/anamnese/public/[slug]',
    'Ficha de anamnese — Prepare a sua visita',
    'Antes da sua sessão, preencha a ficha de anamnese da JP Massagem e indique as informações relevantes para o seu atendimento.',
  ],
  [
    '/anamnese/[token]',
    'A sua ficha de anamnese',
    'Utilize o seu acesso pessoal para preencher a ficha de anamnese e ajudar a preparar a sua próxima sessão na JP Massagem.',
    false,
    true,
  ],
  [
    '/voucher/[id]',
    'Um momento de bem-estar para oferecer',
    'Consulte o seu voucher JP Massagem. Aceda ao link para verificar o estado, a validade e as condições de utilização.',
    false,
    true,
  ],
  [
    '/refer/[code]',
    'Um convite para conhecer a JP Massagem',
    'Recebeu uma indicação para conhecer a JP Massagem. Abra o convite para consultar as condições e os benefícios disponíveis.',
    false,
    true,
  ],
  [
    '/avaliar/[token]',
    'Como foi a sua experiência?',
    'A sua opinião ajuda-nos a cuidar melhor de si. Partilhe a avaliação da sua experiência na JP Massagem através deste link pessoal.',
    false,
    true,
  ],
  [
    '/join/[token]',
    'Convite para a equipa JP Massagem',
    'Recebeu um convite para colaborar no espaço de trabalho JP Massagem. Aceda ao link para iniciar sessão e consultar o convite.',
    false,
    true,
  ],
  [
    '/login',
    'Entrar na JP Massagem',
    'Aceda à sua conta no espaço de trabalho JP Massagem. Utilize as suas credenciais para continuar.',
  ],
  [
    '/signup',
    'Criar acesso à JP Massagem',
    'Crie o seu acesso ao espaço de trabalho JP Massagem ou continue o processo de adesão associado ao seu convite.',
  ],
  [
    '/forgot-password',
    'Recuperar o acesso à sua conta',
    'Esqueceu-se da palavra-passe? Inicie a recuperação do seu acesso ao espaço de trabalho JP Massagem.',
  ],
  [
    '/reset-password',
    'Definir uma nova palavra-passe',
    'Utilize o seu link de recuperação para definir uma nova palavra-passe e voltar a aceder à sua conta JP Massagem.',
    false,
    true,
  ],
  [
    '/install',
    'Acesso ao espaço de trabalho',
    'Entre na sua conta JP Massagem para continuar para o espaço de trabalho.',
  ],
  [
    '/dashboard',
    'Painel da JP Massagem',
    'Espaço reservado à equipa: agenda do dia, pedidos pendentes e indicadores da operação. É necessário iniciar sessão.',
  ],
  [
    '/agenda',
    'Agenda e marcações',
    'Espaço reservado à equipa JP Massagem para consultar e gerir marcações, horários e profissionais.',
  ],
  [
    '/agenda/lembretes',
    'Lembretes e confirmações da agenda',
    'Espaço reservado à equipa JP Massagem para acompanhar lembretes de sessões, tentativas de envio e respostas dos clientes. É necessário iniciar sessão.',
  ],
  [
    '/inbox',
    'Caixa de entrada',
    'Espaço reservado à equipa JP Massagem para acompanhar conversas e dar continuidade ao atendimento dos clientes.',
  ],
  [
    '/contacts',
    'Clientes e contactos',
    'Gestão de contactos e acompanhamento de clientes no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/contacts/[id]',
    'Ficha de cliente',
    'Acesso reservado à equipa JP Massagem. Inicie sessão para consultar a ficha de cliente de acordo com as suas permissões.',
    false,
    true,
  ],
  [
    '/leads',
    'Oportunidades de contacto',
    'Acompanhe potenciais clientes e organize o seguimento comercial no espaço de trabalho JP Massagem.',
  ],
  [
    '/pipelines',
    'Oportunidades comerciais',
    'Organize as etapas comerciais e acompanhe oportunidades no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/finance',
    'Gestão financeira',
    'Vendas, recebimentos e benefícios no espaço de trabalho JP Massagem. Inicie sessão com as permissões adequadas.',
  ],
  [
    '/benefits',
    'Vouchers e packs',
    'Acompanhe vouchers, packs e benefícios de clientes no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/referrals',
    'Indicações de clientes',
    'Consulte e acompanhe o programa de indicações no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/avaliacoes',
    'Gestão de avaliações',
    'Consulte as avaliações recebidas e acompanhe a experiência dos clientes no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/reports',
    'Relatórios e indicadores',
    'Consulte os relatórios da operação e acompanhe os resultados no espaço de trabalho JP Massagem.',
  ],
  [
    '/business-hub',
    'Centro de gestão',
    'Acompanhe o negócio e organize a operação no centro de gestão da JP Massagem. Acesso reservado.',
  ],
  [
    '/business-hub/goals',
    'Objetivos do negócio',
    'Defina e acompanhe objetivos no espaço de gestão JP Massagem. Inicie sessão para continuar.',
  ],
  [
    '/notifications',
    'Notificações da equipa',
    'Consulte alertas, acompanhe ocorrências e resolva pendências no espaço de trabalho JP Massagem.',
  ],
  [
    '/tasks',
    'Tarefas e seguimento',
    'Organize tarefas e próximas ações de atendimento no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/scheduled-messages',
    'Mensagens agendadas',
    'Consulte e organize as mensagens agendadas no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/broadcasts',
    'Campanhas de mensagens',
    'Organize campanhas de comunicação no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/broadcasts/new',
    'Preparar uma campanha',
    'Crie e prepare uma campanha de mensagens no espaço de trabalho JP Massagem. Acesso reservado.',
  ],
  [
    '/broadcasts/[id]',
    'Detalhes da campanha',
    'Acesso reservado à equipa JP Massagem para consultar os detalhes e acompanhar uma campanha de mensagens.',
    false,
    true,
  ],
  [
    '/social-planner',
    'Planeamento de redes sociais',
    'Organize conteúdos e publicações no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/portal-campaigns',
    'Campanhas do portal',
    'Prepare e acompanhe campanhas do Portal 360 no espaço de trabalho JP Massagem.',
  ],
  [
    '/segments',
    'Segmentos de clientes',
    'Organize grupos de contactos para o acompanhamento e a comunicação da equipa JP Massagem.',
  ],
  [
    '/automations',
    'Automações do atendimento',
    'Consulte e organize as automações no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/automations/new',
    'Criar uma automação',
    'Prepare uma nova automação de atendimento no espaço de trabalho JP Massagem.',
  ],
  [
    '/automations/[id]/edit',
    'Configurar uma automação',
    'Acesso reservado à equipa JP Massagem para configurar uma automação de atendimento.',
    false,
    true,
  ],
  [
    '/automations/[id]/logs',
    'Histórico de automação',
    'Acesso reservado à equipa JP Massagem para acompanhar as execuções de uma automação.',
    false,
    true,
  ],
  [
    '/flows',
    'Fluxos de atendimento',
    'Organize os fluxos de atendimento no espaço de trabalho JP Massagem. Acesso reservado à equipa.',
  ],
  [
    '/flows/[id]',
    'Configurar um fluxo',
    'Acesso reservado à equipa JP Massagem para consultar e configurar um fluxo de atendimento.',
    false,
    true,
  ],
  [
    '/flows/[id]/runs',
    'Execuções de um fluxo',
    'Consulte o acompanhamento de execuções no espaço reservado à equipa JP Massagem.',
    false,
    true,
  ],
  [
    '/agents',
    'Assistentes de IA',
    'Configure os assistentes de inteligência artificial no espaço de trabalho JP Massagem. Acesso reservado.',
  ],
  [
    '/library',
    'Biblioteca de conteúdos',
    'Organize materiais e conteúdos de trabalho na biblioteca da equipa JP Massagem.',
  ],
  [
    '/settings',
    'Definições da JP Massagem',
    'Consulte as definições e as atualizações do sistema no espaço de trabalho JP Massagem. Acesso reservado.',
  ],
  [
    '/settings/whatsapp',
    'Configuração do WhatsApp',
    'Acesso reservado à equipa JP Massagem para consultar e configurar a ligação WhatsApp.',
  ],
  [
    '/website',
    'Gestão do site',
    'Configure os conteúdos públicos do site JP Massagem no espaço reservado à equipa.',
  ],
  [
    '/private-management',
    'Gestão reservada',
    'Área de gestão com acesso restrito no espaço de trabalho JP Massagem.',
  ],
  [
    '/system-health',
    'Estado do sistema',
    'Consulte o estado dos serviços no espaço reservado à equipa JP Massagem.',
  ],
  [
    '/help',
    'Ajuda e orientação',
    'Consulte as orientações de utilização no espaço de trabalho JP Massagem.',
  ],
  [
    '/support',
    'Apoio à equipa',
    'Aceda ao apoio e acompanhe pedidos no espaço reservado à equipa JP Massagem.',
  ],
];

export const LINK_PREVIEWS: LinkPreview[] = entries.map(
  ([path, title, description, isPublic = false, sensitive = false]) => ({
    path,
    title,
    description,
    public: isPublic,
    sensitive,
  })
);
export function previewForRoute(path: string): LinkPreview {
  const preview = LINK_PREVIEWS.find((item) => item.path === path);
  if (!preview) throw new Error(`Missing sharing copy for route: ${path}`);
  return preview;
}

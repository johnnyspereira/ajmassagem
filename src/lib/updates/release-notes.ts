export type UpdateCategory =
  'Novidade' | 'Melhoria' | 'Correção' | 'Manutenção';
export interface ReleaseNote {
  id: string;
  date: string;
  title: string;
  category: UpdateCategory;
  areas: string[];
  summary: string;
  changes: string[];
  howTo: string;
  link?: { label: string; href: string };
}

/** Newest first. Published with the application so the history needs no SQL requests. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-10-17-account-clock',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Data e hora no cabeçalho e fuso horário consistente',
    areas: ['Sistema', 'Inbox', 'Navegação'],
    summary:
      'Relógio visível entre a pesquisa e o ponto, usando o fuso da conta.',
    changes: [
      'Data e hora atuais no cabeçalho, atualizadas automaticamente.',
      'Horário das mensagens apresentado no fuso configurado da conta.',
      'Sessões MySQL em UTC para evitar a hora adicional nos novos registos gerados pelo servidor.',
    ],
    howTo:
      'Consulte a data e hora junto à pesquisa. O fuso é o configurado nas Definições gerais. Registos antigos não são deslocados automaticamente.',
  },
  {
    id: '2026-10-17-media-caption-layout',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Fotografias sem códigos e escrita com espaço no telemóvel',
    areas: ['Inbox', 'Anexos'],
    summary:
      'Conteúdo codificado dos ficheiros deixa de aparecer como legenda ou mensagem.',
    changes: [
      'Proteção contra base64 nas legendas, prévias e citações de mensagens antigas e novas.',
      'Tipo original de imagem, áudio ou vídeo preservado ao receber conteúdo codificado.',
      'Compositor com escrita e controlos em linhas separadas, e mensagens compridas com quebra de linha.',
    ],
    howTo:
      'Atualize o Inbox. As fotografias continuam disponíveis para abrir e descarregar, sem o código dos ficheiros por baixo.',
  },
  {
    id: '2026-10-17-inbox-layout-live',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Inbox alinhado e novas conversas sem sincronização manual',
    areas: ['Inbox', 'WhatsApp', 'Atualização automática'],
    summary:
      'Layout revisto para preservar espaço de leitura e acompanhar as novas conversas automaticamente.',
    changes: [
      'Grelha consistente para seleção, avatar, nome, horário, mensagem e etiquetas.',
      'Horários compactos, filtros em português e lista sem cortes laterais.',
      'Cabeçalho, conversa, compositor e painel de contacto adaptados a telemóveis e portáteis.',
      'Consulta automática ordenada pelos registos mais recentes, corrigindo a perda de novidades após os primeiros 500 registos.',
      'Worker repete a entrega quando o contacto ainda não está resolvido ou ocorre uma falha temporária, sem depender de sincronização manual.',
    ],
    howTo:
      'Mantenha o Inbox aberto para acompanhar novas conversas. No telemóvel, selecione uma conversa e use a seta para voltar à lista. O painel de contacto abre por botão em ecrãs menores.',
  },
  {
    id: '2026-10-17-inbox-media-search',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Inbox com menu acessível, anexos e pesquisa por ferramenta',
    areas: ['Inbox', 'Anexos', 'Pesquisa'],
    summary:
      'O Inbox ganha acesso ao menu e os anexos passam a ter visualização, download e recuperação.',
    changes: [
      'Menu lateral disponível pelo cabeçalho do Inbox, com abertura e fecho no computador e telemóvel.',
      'Lista e conversa ajustadas à largura disponível, com tempos em português.',
      'Imagens ampliáveis, pré-visualização de PDF e controlos de áudio e vídeo com download.',
      'Carregamento autenticado dos anexos, mensagens de falha e recuperação pelo WhatsApp quando o ficheiro não está guardado.',
      'Compatibilidade do worker com o descarregamento e a identificação de mensagens na versão atual do WhatsApp Web, incluindo anexos enviados pelo telemóvel.',
      'Pesquisa encontra WhatsApp, calendário, pagamentos e outros nomes comuns, incluindo atalhos de configuração.',
    ],
    howTo:
      'No Inbox, abra o menu no canto superior esquerdo. Clique numa imagem ou PDF para ampliar. Se faltar um anexo, use Recuperar do WhatsApp; a recuperação depende de o ficheiro ainda estar disponível no WhatsApp. Use Ctrl+K e procure WhatsApp para abrir as conversas ou a configuração.',
  },
  {
    id: '2026-10-17-single-navigation',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Uma única navegação, sem menus duplicados',
    areas: ['Menus', 'Definições'],
    summary:
      'Os links ficam na sidebar e o cabeçalho concentra as ferramentas da conta.',
    changes: [
      'Removidos os menus e o logótipo repetidos na barra superior.',
      'Cabeçalho com o título da página, pesquisa, ponto, sino, tema e perfil.',
      'Sidebar recolhível e menu móvel preservados.',
    ],
    howTo:
      'Use o menu lateral para navegar e Ctrl+K para procurar uma ferramenta.',
  },
  {
    id: '2026-10-17-combined-navigation',
    date: '2026-10-17',
    category: 'Melhoria',
    title: 'Menu superior e lateral sempre juntos',
    areas: ['Menus', 'Definições'],
    summary:
      'No computador, a topbar e a sidebar passam a aparecer em simultâneo.',
    changes: [
      'Navegação superior e lateral disponíveis juntas, independentemente da preferência antiga.',
      'Sidebar recolhível e menus superiores adaptados ao espaço disponível.',
      'No telemóvel, a barra superior mantém o botão para abrir o menu lateral.',
    ],
    howTo:
      'Use a sidebar ou os atalhos superiores. Recolha a sidebar para ganhar espaço sem perder os menus.',
  },
  {
    id: '2026-10-17-navigation-alignment',
    date: '2026-10-17',
    category: 'Melhoria',
    title: 'Cabeçalho mais compacto e alinhado com o painel',
    areas: ['Menus', 'Painel'],
    summary:
      'A navegação superior acompanha a largura do painel em ecrãs grandes.',
    changes: [
      'Logótipo, menus e controlos alinhados com as margens do dashboard.',
      'Altura do cabeçalho reduzida para dar mais espaço ao conteúdo.',
      'Botão do menu lateral reservado aos ecrãs pequenos, onde é necessário.',
    ],
    howTo:
      'No formato de navegação superior, os menus continuam disponíveis por área. No telemóvel, abra o menu pelo botão no cabeçalho.',
  },
  {
    id: '2026-10-17-navigation-redesign',
    date: '2026-10-17',
    category: 'Melhoria',
    title: 'Uma navegação organizada à volta do seu trabalho',
    areas: ['Menus', 'Navegação', 'Definições'],
    summary:
      'Sidebar e topbar redesenhadas com os mesmos grupos, pesquisa rápida e controlos alinhados.',
    changes: [
      'Ferramentas organizadas em O meu dia, Negócio, Comunicação, Automação e Espaço de trabalho.',
      'Sidebar recolhível para ícones e menu móvel com navegação por grupos.',
      'Topbar com acessos diretos às tarefas diárias e menus das restantes áreas.',
      'Notificações acessíveis apenas pelo sino junto ao modo claro/escuro.',
      'Pesquisa de ferramentas com Ctrl+K e acessos ao perfil, definições e atualizações no menu da conta.',
      'Contadores partilhados entre os menus para evitar consultas repetidas.',
    ],
    howTo:
      'Escolha o formato de navegação em Definições → Aparência. Use Ctrl+K para procurar uma área, Recolher menu para ganhar espaço e o sino para consultar as notificações.',
  },
  {
    id: '2026-10-17-link-previews',
    date: '2026-10-17',
    category: 'Novidade',
    title: 'Textos e imagens preparados para partilhar os links',
    areas: ['Site', 'Portal 360', 'Definições'],
    summary:
      'As páginas passam a ter títulos, descrições e imagens de pré-visualização para WhatsApp e redes sociais.',
    changes: [
      'Catálogo de textos para todas as famílias de páginas, incluindo marcações, portal, vouchers, anamnese, avaliações e convites.',
      'Pré-visualizações de serviços e profissionais com os respetivos conteúdos públicos.',
      'Imagem de partilha JP Massagem com o logótipo e formatos de metadados para redes sociais.',
      'Links pessoais com textos genéricos, sem nomes de clientes, saldos ou respostas de formulários nos cartões.',
      'Nova secção Partilha de links nas Definições, com pesquisa, consulta dos textos e botões para copiar.',
    ],
    howTo:
      'Abra Definições → Partilha de links para consultar os textos. Partilhe o endereço real da página. Secções com # usam a pré-visualização da página principal; as plataformas podem manter em cache uma pré-visualização anterior.',
    link: {
      label: 'Consultar textos de partilha',
      href: '/settings?tab=link-previews',
    },
  },
  {
    id: '2026-10-17-brand-icons',
    date: '2026-10-17',
    category: 'Correção',
    title: 'O logótipo JP Massagem nos ícones da aplicação',
    areas: ['Identidade visual', 'Sistema'],
    summary:
      'O ícone genérico foi substituído pelo logótipo fornecido da JP Massagem.',
    changes: [
      'Logótipo no separador do navegador e nos ícones de instalação da aplicação.',
      'Imagens próprias para os tamanhos 32, 64, 180, 192 e 512 píxeis, preservando as proporções do original.',
      'Ícone adaptável com margem de segurança e manifesto com os tamanhos reais, corrigindo o aviso apresentado pelo navegador.',
    ],
    howTo:
      'Atualize a página para ver o novo ícone. Se o sistema operativo mantiver um ícone antigo numa instalação existente, poderá ser necessário voltar a adicionar o atalho da aplicação.',
  },
  {
    id: '2026-10-17-update-history',
    date: '2026-10-17',
    category: 'Novidade',
    title: 'Um histórico para todas as atualizações',
    areas: ['Definições', 'Sistema'],
    summary:
      'As novidades, melhorias e correções do CRM passam a ter um lugar próprio nas Definições.',
    changes: [
      'Histórico organizado por data, com uma descrição do que mudou e instruções de utilização.',
      'Pesquisa por assunto e filtros por tipo de atualização.',
      'Registo inicial das alterações ao dashboard, das correções de carregamento, das notificações e da recuperação dos serviços locais.',
    ],
    howTo:
      'Abra Definições → Atualizações. Pesquise uma funcionalidade ou escolha um tipo para consultar o respetivo histórico.',
  },
  {
    id: '2026-10-17-notification-groups',
    date: '2026-10-17',
    category: 'Melhoria',
    title: 'Notificações repetidas reunidas num grupo',
    areas: ['Notificações'],
    summary:
      'Os alertas relacionados ficam reunidos, com um contador e um histórico que pode expandir.',
    changes: [
      'Agrupamento de eventos do mesmo tipo por conversa, cliente ou situação com destino identificado.',
      'Contador visível para distinguir um alerta isolado de vários eventos relacionados.',
      'Histórico expansível com os títulos, mensagens, datas e acesso a cada evento do grupo.',
      'As ações de marcar como lido e resolver aplicam-se aos eventos do grupo, preservando o histórico.',
    ],
    howTo:
      'Abra Notificações e procure os cartões com o contador de eventos. Expanda o histórico para consultar cada ocorrência.',
    link: { label: 'Abrir notificações', href: '/notifications' },
  },
  {
    id: '2026-10-17-dashboard-loading',
    date: '2026-10-17',
    category: 'Correção',
    title: 'Carregamento mais leve no alojamento',
    areas: ['Dashboard', 'Desempenho'],
    summary:
      'Redução dos picos de consultas que contribuíam para os erros 508 de limite de recursos no cPanel.',
    changes: [
      'Consultas com concorrência limitada e atualizações do dashboard sem sobreposição.',
      'Os indicadores e a atividade só são consultados quando o respetivo separador é aberto.',
      'O seguimento de clientes só carrega ao expandir a secção.',
      'Contagens calculadas diretamente na base de dados, sem transferir todas as linhas.',
      'Uma falha temporária mantém os últimos dados disponíveis com um aviso de desatualização.',
    ],
    howTo:
      'Use Atualizar para voltar a consultar os dados. Se aparecer um aviso de desatualização, aguarde a recuperação do serviço antes de tomar decisões.',
    link: { label: 'Abrir dashboard', href: '/dashboard' },
  },
  {
    id: '2026-10-17-dashboard-redesign',
    date: '2026-10-17',
    category: 'Melhoria',
    title: 'Um dashboard centrado na agenda e nas pendências',
    areas: ['Dashboard', 'Agenda', 'Portal 360'],
    summary:
      'A operação diária foi reorganizada para consultar os atendimentos e tratar reservas no mesmo ecrã.',
    changes: [
      'Resumo de marcações, recebimentos, valores por receber e clientes à espera.',
      'Agenda de hoje com pesquisa por cliente ou procedimento e filtros por estado.',
      'Ações para confirmar, cancelar e reagendar diretamente no dashboard, com registo na agenda e notificação ao cliente.',
      'Pedidos do Portal 360 separados das marcações já confirmadas; pedidos de reagendamento resolvidos deixam de reaparecer.',
      'Validação de conflitos de horário e tratamento dos benefícios reservados. Cancelamentos com pagamentos seguem o processo financeiro na agenda.',
      'Separadores para o dia, indicadores e atividade, com apresentação adaptada ao telemóvel.',
    ],
    howTo:
      'No dashboard, escolha uma marcação e use Confirmar, Reagendar ou Cancelar. Consulte Indicadores para os relatórios e Atividade para os acontecimentos recentes.',
    link: { label: 'Explorar o dashboard', href: '/dashboard' },
  },
  {
    id: '2026-10-16-local-services',
    date: '2026-10-16',
    category: 'Manutenção',
    title: 'Recuperação dos serviços locais após a formatação',
    areas: ['WhatsApp', 'IA', 'Control Center'],
    summary: 'O ambiente Windows que suporta os workers do CRM foi recuperado.',
    changes: [
      'Preparação do Node.js, das dependências dos workers, do cloudflared e do Ollama.',
      'Instalação do modelo de IA qwen2.5:3b e validação de uma resposta local.',
      'Recuperação dos dois túneis Cloudflare e da sessão WhatsApp existente.',
      'Criação do atalho do JP Massagem Control Center na Área de Trabalho, com ícone.',
    ],
    howTo:
      'No computador que aloja os workers, utilize o JP Massagem Control Center para verificar os serviços. Esse computador precisa de estar ligado para disponibilizar o WhatsApp por QR e a IA local.',
  },
];

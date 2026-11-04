# Destino do pedido de avaliação

## Pedido manual no Inbox (04/11/2026)

O botão **Pedir avaliação Google**, junto ao campo de mensagem, prepara um convite para avaliar a nova página, com comentário ou apenas estrelas. Usa sempre `review_google_url`, mesmo que a Agenda esteja configurada para avaliações internas. O endereço deve estar guardado em Definições → Mensagens automáticas → Link de avaliação. Sem endereço HTTPS válido, apresenta instruções e não inventa uma ligação.

O pedido fica no rascunho editável e é enviado pelo fluxo normal da conversa quando o operador clica em Enviar. Preserva texto já escrito, evita inserir duas cópias idênticas e cancela a preparação pendente ao mudar de conversa. Não marca uma avaliação como recebida nem altera o histórico de pedidos automáticos da Agenda.

O endpoint de preparação é apenas de leitura, exige agente ou superior e procura a conversa e o contacto na conta autenticada. Não envia mensagens nem consulta dados de outra conta. A validação foi feita com testes de dados fictícios, sem contactar clientes.

Correção de 03/11/2026: o painel autenticado e o envio preparam automaticamente os quatro campos da migração 057 antes de os utilizar. A verificação é partilhada por pedidos concorrentes no processo e pode ser repetida após falha. Cada coluna em falta é acrescentada separadamente, preservando valores existentes e suportando migrações parcialmente aplicadas. Sem permissões ALTER, o painel mostra instruções específicas; não simula uma gravação bem-sucedida. A indisponibilidade da base local impediu validar diretamente a instalação de produção; os testes usam uma base simulada.

Painel → **Link de avaliação** abre `/settings?tab=automated-messages#review-link`. Administradores e proprietários podem escolher Sistema ou Google / link externo e guardar um endereço HTTPS. A escolha pertence à conta, não ao funcionário ou ao navegador.

A migration `057_appointment_review_destination.sql` acrescenta `review_link_mode` (predefinido Sistema) e `review_google_url` a `clinic_communication_settings`, e os campos de auditoria `sent_link_mode`/`sent_link_url` aos pedidos. A Comunicação da Clínica deve estar configurada. O endpoint `/api/clinic/review-settings` exige papel admin, verifica a conta autenticada e atualiza apenas estes campos numa transação. Não depende de retorno de linhas nas atualizações do adaptador Supabase/MySQL.

`sendAppointmentReviewRequest` aplica a escolha ao preencher `{link_avaliacao}`. O Sistema continua a gerar uma ligação por atendimento; a opção externa usa o endereço guardado, sem carregar ou verificar esse site no servidor. Links externos não preenchem avaliações internas automaticamente. Endereços não HTTPS, credenciais, caracteres de controlo e valores excessivos são rejeitados antes do envio.

O envio mantém a escolha de notificar ou não da agenda e a proteção existente por `sent_at`: mudar o destino não reenvia pedidos anteriores. A gravação da definição não envia mensagens. O modelo deve conter `{link_avaliacao}`. O formulário de Comunicação da Clínica exclui estes dois campos da sua gravação, para não repor uma cópia antiga da configuração.

Verificação: testes do destino real interpolado no texto, preservação do link pessoal, URL externa, troca sem reenvio, erros antes do transporte, proteção por conta/papel e gravação sem tocar em modelos ou outras definições. O navegador usou apenas dados fictícios com APIs intercetadas para verificar gravação, persistência, retorno ao Sistema, erros e larguras de desktop e telemóvel. Não foi enviada mensagem a clientes.

# Jornada pública de serviços e planos

O template ativo é `JpMassagemPublicSite`, usado pela página inicial e `/site/[slug]`. Mantém as fotografias, cores e tipografia editorial existentes. O catálogo interativo apresenta todos os serviços devolvidos pela consulta pública (até 24), respeitando `show_services`, serviços ativos, publicação online e exclusão de modalidades em breve.

Pesquisa normaliza acentos, filtro separa sessões até 60 minutos e mais longas, e ordenação por preço aparece apenas quando a moeda é comum. A comparação aceita no máximo três escolhas, incluindo cliques rápidos. O diálogo nativo mantém foco, fecha com Escape e possui corpo com rolagem e rodapé acessível. Só apresenta as informações configuradas para o serviço, sem recomendações clínicas geradas.

Agendar usa `/portal?book=1&service=<id>` quando `show_booking` e o Portal permitem reservas. Sem marcação online, o pedido de informações preenche apenas o assunto do formulário. Planos e vouchers são pedidos de contacto, sem checkout público novo, promessa de disponibilidade ou ativação automática. O evento de preenchimento verifica o slug e o tamanho do assunto e nunca submete o formulário. Dados pessoais já escritos são preservados.

Os planos respeitam `show_plans`. Avaliações internas vêm da consulta que exige publicação e consentimento; avaliações Google vêm da lista aprovada e dependem da opção Google. O template abrevia nomes e preserva as notas de origem. Testemunhos manuais não recebem estrelas inventadas. O interruptor geral de testemunhos oculta toda essa área.

Verificação: testes de pesquisa, filtros, ordenação imutável, comparação limitada, preços com cêntimos, ligações e abreviação de nomes. Uma página temporária com dados fictícios foi usada para verificar desktop, portátil e larguras de 390 e 360 pixels; não integra a aplicação final. APIs de contacto foram intercetadas para verificar erro e recuperação sem enviar pedidos reais. As fotografias são os recursos já existentes no projeto; nenhum ativo externo novo foi adicionado.

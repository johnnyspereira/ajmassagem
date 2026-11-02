# Detalhes públicos dos planos

O botão **Ver o plano** da página inicial abre `/site/[slug]/planos/[plan]`, uma página de leitura própria, sem formulário obrigatório. A chave inclui a posição e o nome para distinguir planos com nomes repetidos. Alterar a ordem ou o nome altera a ligação. A página exige que o site e a secção de planos estejam publicados; uma ligação inexistente ou oculta devolve 404.

O editor `/website` → **Planos e benefícios** permite associar um `pack_id` a cada plano. O campo é opcional no JSON de `public_site_settings.plans`, sem migration nova. Planos existentes continuam independentes até associação explícita; não se tenta adivinhar a correspondência por preço ou nome.

`loadPublicPlanPacks` lê apenas os IDs explicitamente associados, dentro da conta do site. Devolve nome, descrição, valor, moeda, validade e composição. Cada modalidade precisa de estar ativa, publicada no site, habilitada online e fora de Em breve. Um pack sem composição válida ou com parte das modalidades oculta não é publicado parcialmente. Não há consulta a packs de clientes, vendas, códigos ou PINs.

Para planos associados, o preço do catálogo prevalece sobre o texto manual na lista e na página. O preço manual fica preservado para eventual desvinculação. Um pack ausente ou desativado aparece como indisponível, sem adesão nem apresentação do preço manual antigo. O título e o texto comercial do plano continuam no editor do site. Sessões, duração e validade são dados do cadastro, sem geração de condições comerciais.

WhatsApp abre por ligação com texto preenchido, sem enviar mensagens automaticamente. Se não houver WhatsApp configurado, a página mantém telefone ou contacto do site conforme a configuração existente. Não foi criado checkout novo nem ativação automática de benefícios.

Verificação: testes de escopo da conta e seleção pública de campos, visibilidade de modalidades, composição completa, preço canónico, plano independente, indisponibilidade, ligações, conteúdo renderizado e páginas ocultas. A verificação no navegador usou dados fictícios e APIs intercetadas: quatro tamanhos de ecrã, navegação para detalhes e regresso, acesso ao botão e gravação da associação no editor. Páginas e dados temporários de demonstração não integram a versão final.

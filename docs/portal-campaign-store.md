# Loja de campanhas e acompanhamento de acessos

## Configuração e utilização

Em Campanhas do Portal, crie ou edite uma campanha e escolha o tipo:

- **Promocional:** oculta no Portal para clientes com saldo EUR superior a zero. A compra e o envio da campanha por email também verificam esta regra no servidor.
- **Troca de saldo:** visível com ou sem saldo. A compra utiliza o saldo EUR disponível até ao preço da campanha e permite pagar a diferença.

Ative **Comprar diretamente no Portal**, associe uma modalidade (emite voucher de uma sessão) ou um pack ativo e defina o preço final. O voucher tem validade configurável; o pack mantém composição e validade do catálogo. Campanhas existentes mantêm o texto e preço, mas precisam de associação explícita para emitir benefícios. Não são associadas automaticamente pelo nome.

O cliente abre a campanha, consulta o resumo e confirma. Uma oferta de 59 € com 20 € de saldo gera uma venda de 59 €, um pagamento `client_credit` de 20 € sem caixa físico e uma diferença de 39 €. O saldo é descontado ao confirmar e fica ligado à compra; o benefício permanece pendente até à liquidação integral.

**Cartão:** checkout SumUp apenas para a diferença. O webhook existente regista o pagamento confirmado; o caminho comum de pagamentos ativa o voucher ou pack e marca a adesão como convertida. **MB WAY:** o Portal indica o número 935864343, valor e referência; não considera o pagamento recebido só por apresentar instruções ou comprovativo. A equipa regista a receção na venda no Financeiro. Uma compra com saldo suficiente fica paga e o benefício disponível imediatamente no Portal.

O método da diferença fica fixado ao iniciar o pagamento. Para o alterar, a equipa deve rever a compra e qualquer link já emitido antes de anular ou criar outra venda. Isto evita oferecer simultaneamente dois meios de pagamento para a mesma diferença.

Repetir o pedido retoma a venda existente, sem outro débito. Uma alteração de saldo ou preço depois da pré-visualização exige nova revisão antes de criar a compra. O checkout utiliza referência estável, consulta a SumUp antes de criar e recupera pedidos com resposta incerta. Anular ou reembolsar a venda pelo Financeiro devolve a parte paga em cartão-saldo na mesma transação da anulação; os movimentos monetários seguem as regras de reembolso existentes. Não efetua transferências bancárias.

## Acessos

Administradores e proprietário podem abrir **Acompanhar acessos ao Portal, campanhas e CRM** na página de Campanhas. Há filtros por tipo, pesquisa, últimos 7/30/90 dias e paginação. Os registos identificam o cliente ou membro da equipa, página/campanha e data em Europe/Lisbon.

O Portal regista a navegação autenticada e campanhas que entram efetivamente no ecrã. O CRM regista páginas visitadas pela equipa e presença na página visível a cada cinco minutos. A mesma pessoa/página/campanha é agrupada em intervalos de cinco minutos. Isto mede consultas, não garante leitura, intenção de compra nem identifica visitantes anónimos. O registo começa após instalar esta atualização; não recupera acessos anteriores. Não guarda IP, user agent, termos de pesquisa, parâmetros da URL ou credenciais.

## Instalação e verificação

A migração `058_portal_campaign_store.sql` acrescenta os tipos, validade, método escolhido e a tabela de acessos. Existe preparação idempotente dos campos em falta nos endpoints da loja. São necessárias permissões MySQL para aplicar essas alterações. Reinicie a aplicação após instalar o pacote.

Testes com dados fictícios cobrem elegibilidade, cêntimos, saldo parcial/integral, repetição, catálogo e conta, capacidade, confirmação de pagamentos, anulação de saldo, método fixado e recuperação de checkout. O navegador usa APIs intercetadas: nenhuma cobrança, mensagem ou alteração de dados reais é executada na validação visual.

Referência do prestador para recuperar checkouts pela referência: [SumUp — List checkouts](https://developer.sumup.com/api/checkouts/list/).

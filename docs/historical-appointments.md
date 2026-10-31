# Regularização de atendimentos antigos

No Painel → Precisa da sua atenção → Atendimentos, o proprietário dispõe de **Regularizar atendimentos antigos**. A consulta usa a pesquisa da fila e o início do dia escolhido em Europe/Lisbon como limite exclusivo. Hoje e datas futuras nunca são regularizados por esta operação.

A pré-visualização reúne todas as páginas (máximo 200 registos; acima disso é necessário restringir a consulta). As caixas de seleção permitem escolher todos os elegíveis ou apenas alguns. O proprietário declara que os atendimentos foram realizados e que as sessões sem venda já foram faturadas/liquidadas fora do CRM, com motivo obrigatório.

- Sem venda ou benefício ativo: cria uma venda histórica liquidada, sem pagamento, com valor e data da marcação e um item de serviço. `is_historical=1`, `paid_amount=0`, `balance_due=0`; não altera o caixa nem emite documento fiscal.
- Venda já paga ou benefício consumido: conclui apenas; preserva a venda, o pagamento e a utilização.
- Venda pendente/parcial/anulada/reembolsada ou benefício reservado: exige revisão individual; não é selecionável.

Todos os registos do lote são revalidados numa transação com bloqueios por conta e marcação. Uma revisão SHA-256 das marcações, vendas e benefícios deteta alterações após a consulta. Uma repetição não cria outra venda: os registos já concluídos deixam de satisfazer o filtro e a transação é rejeitada. Falhas revertem todo o lote. Os eventos de auditoria financeira e da agenda guardam utilizador, motivo, lote e tipo de regularização.

Links de anamnese pendentes são revogados; respostas submetidas são preservadas. Não são enviados WhatsApps ou emails. A operação não serve para apagar dívidas reais, corrigir impostos ou devolver benefícios.

Verificação: testes de permissões e escopo da conta, confirmação explícita, datas de Lisboa, dívidas e benefícios reservados, revalidação, repetição, SQL parametrizado, ausência de escritas em pagamentos/caixa, identificação do histórico no Cliente 360 e exclusão dos totais mensais operacionais. A pré-visualização visual usa apenas dados fictícios e interceta todos os pedidos à API.

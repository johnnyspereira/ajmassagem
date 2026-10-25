# Revisão dos fluxos financeiros — 25/10/2026

Esta revisão verifica contratos do código e cenários simulados. Não é uma reconciliação contabilística da base de produção nem uma confirmação dos extratos bancários.

## Correções concluídas

| Fluxo | Verificação e comportamento |
| --- | --- |
| Agenda → POS | Uma nova venda ligada à marcação verifica a conta e bloqueia o atendimento já pago, cancelado ou liquidado por benefício. A marcação é bloqueada na transação durante a verificação. |
| Marcação paga | O botão Receber fica desativado; pagamentos parciais continuam por liquidar. |
| Anamnese | Apenas fichas pendentes de marcações concluídas são revogadas. GET e POST públicos recusam esse preenchimento. Fichas submetidas e revistas são preservadas. |
| Despesa já paga | Lançar saída está no cabeçalho do Financeiro. Regista uma conta paga na Tesouraria e o movimento correspondente na mesma transação. |
| Dinheiro físico | Uma despesa do turno aberto gera movimento de caixa ligado à conta paga. Uma despesa anterior ao turno ou com caixa fechado gera movimento na conta financeira, sem mexer no turno atual. |
| Despesa bancária | Gera débito na conta financeira escolhida e conta paga, sem retirar notas e moedas do caixa. |
| Repetição do pedido | O identificador do lançamento permite repetir um pedido da mesma janela sem criar outra saída. |
| Lembretes | O agendador local chama também o processamento de lembretes da Tesouraria, além dos lembretes da Agenda. |
| Cobranças ao proprietário | O resumo inclui até dez vendas antigas pendentes: cliente, referência, venda, valor em falta, data e ligação direta. Não envia cobranças aos clientes. |
| Calendário | O dia dos lembretes e dos formulários da Tesouraria usa Europe/Lisbon. |

## Ligações existentes revistas

- Receber uma prestação ligada a uma venda usa o registo financeiro de pagamento dessa venda.
- Liquidar uma conta a pagar em dinheiro usa um caixa aberto e liga o movimento à conta, preservando o histórico.
- As saídas já pagas não devem voltar a ser lançadas como novas despesas: a conta correspondente já aparece paga na Tesouraria.
- Totais mensais de vendas e pagamentos usam datas diferentes: criação da venda e recebimento do pagamento. Essa diferença é intencional e não implica, por si, um erro.

## Limites da verificação

- Não foram efetuados pagamentos, transferências ou lançamentos reais para testar.
- As verificações automáticas usam dados simulados; os montantes reais continuam a exigir conferência com caixa e extratos.
- Entrega de WhatsApp exige sessão ligada, número de destino configurado e agendador disponível. Um registo de fila não é prova de leitura ou receção pelo destinatário.
- Reembolsos contabilísticos do CRM não substituem a devolução bancária de dinheiro.

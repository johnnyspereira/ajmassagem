# Central de pendências

Disponível em Painel → O meu dia, na secção **Precisa da sua atenção**. As ligações abrem o registo de origem; abrir uma pendência não a marca como resolvida.

- **Atendimentos:** sessões agendadas ou confirmadas cujo horário de fim já passou. Uma reserva de benefício é indicada na mesma linha, evitando repetir o atendimento em duas categorias.
- **Pagamentos:** vendas abertas ou parcialmente pagas com saldo positivo. Vendas históricas, anuladas, reembolsadas ou sem saldo em dívida ficam excluídas.
- **Benefícios:** sessões concluídas com voucher ou pack ainda reservado, depois do horário de fim.
- **Caixa:** turnos abertos de dias anteriores e, a partir das 21:30 de Lisboa, o turno aberto do dia.
- **Mensagens:** falhas da fila WhatsApp e pedidos ainda em fila há mais de 15 minutos, sem uma reserva de processamento válida. A fila não equivale a confirmação de entrega ou leitura.

A pesquisa, as contagens e a paginação são executadas no servidor, por conta autenticada. Utilizadores de consulta não têm acesso à central. A leitura não altera dinheiro, benefícios, atendimentos nem mensagens.

A atualização ocorre a cada minuto com a página visível e ao regressar à janela, com proteção contra pedidos automáticos sobrepostos. Uma falha de consulta aparece como erro, nunca como ausência de pendências.

**Adiar 1 h** oculta uma linha nesta lista e neste dispositivo. Não adia os lembretes automáticos nem resolve o registo. **Mostrar adiadas** e **Repor na fila** permitem consultar e desfazer o adiamento.

Os lembretes de fecho existentes mantêm as fases das 21:30 e 23:15, dependentes do agendador. Identificam até oito atendimentos por concluir, com cliente, horário e ligação, e encaminham para a central. Nenhuma comunicação real é enviada nos testes automatizados.

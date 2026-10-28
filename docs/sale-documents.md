# Comprovativos de vendas

Em Financeiro → Vendas, abra uma venda e escolha **Comprovativos**. No POS, a opção **Anexar comprovativo depois de registar** abre a mesma janela após criar a venda. Adicionar um documento não altera pagamentos nem envia comunicações ao cliente.

São aceites PDF, JPG, PNG e WebP até 10 MB por ficheiro. A consulta e o carregamento exigem acesso financeiro (`agent` ou superior) e são sempre limitados à conta autenticada. Os originais são servidos por `/api/finance/sale-documents`, com autenticação e sem cache pública.

Os metadados ficam em `finance_sale_documents`. Os ficheiros ficam em `data/finance-documents`, fora de `data/uploads`, e não são expostos pela rota pública de uploads. `FINANCE_DOCUMENT_DIR` permite configurar outro diretório privado persistente. Inclua a tabela e esse diretório nas cópias de segurança e preserve-os ao transferir a aplicação entre servidores.

A migração `056_sale_documents.sql` cria a tabela; o endpoint também prepara a estrutura quando necessário. Um erro ao guardar os metadados remove apenas o ficheiro que esse pedido acabou de criar. Uma falha ao anexar não volta a executar a venda.

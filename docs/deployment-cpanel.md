# Instalar o CRM por Git no cPanel

Este projeto precisa de um servidor Node.js. Nao o publique como um site
estatico nem copie apenas a pasta `public`.

## Requisitos do alojamento

- Node.js 20 ou 22.
- Aplicacao Node ativa continuamente, sem suspensao por inatividade.
- Acesso SSH/Terminal e Git.
- Permissao para executar Chromium/Puppeteer.
- Diretorio persistente e gravavel para `whatsapp_auth`.
- Ligacoes HTTPS e WebSocket de saida.
- Cron com execucao pelo menos a cada minuto.

O WhatsApp QR nao e adequado a um alojamento partilhado que encerre processos,
proiba Chromium ou apague ficheiros da aplicacao. Nesse caso, use um VPS.

## 1. Publicar no Git

Crie um repositorio privado no GitHub, GitLab ou Bitbucket e envie este projeto.
O `.env.local`, as sessoes WhatsApp e os logs estao ignorados e nao devem ser
adicionados manualmente.

```bash
git remote add origin URL_DO_REPOSITORIO_PRIVADO
git branch -M main
git push -u origin main
```

## 2. Clonar no cPanel

Em **Git Version Control**, clone a branch `main`. Para repositorios privados,
cadastre a chave SSH apresentada pelo cPanel no provedor Git.

Use a pasta clonada como **Application root** em **Setup Node.js App**.

## 3. Configurar a aplicacao Node

Configure:

- Node.js version: `20` ou `22`.
- Application mode: `Production`.
- Application startup file: `server.cjs`.
- Application URL: o dominio ou subdominio do CRM.

No Terminal do cPanel, dentro da raiz clonada, execute:

```bash
npm ci
npm run build
```

Depois use **Restart Application** no Setup Node.js App. O cPanel fornece a
porta em `PORT`; o `server.cjs` ja esta preparado para utiliza-la.

## 4. Variaveis de ambiente

Cadastre no painel da aplicacao, nunca no Git:

```dotenv
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
ENCRYPTION_KEY=64_CARACTERES_HEXADECIMAIS
META_APP_SECRET=SEGREDO_META
NEXT_PUBLIC_SITE_URL=https://crm.seudominio.pt
NEXT_PUBLIC_APP_LOCALE=pt
ALLOWED_INVITE_HOSTS=crm.seudominio.pt
AUTOMATION_CRON_SECRET=SEGREDO_LONGO_E_ALEATORIO
```

As variaveis `NEXT_PUBLIC_*` sao incorporadas durante o build. Se forem
alteradas, execute `npm run build` novamente e reinicie a aplicacao.

## 5. Preservar a sessao WhatsApp QR

A pasta `whatsapp_auth` e criada na raiz em tempo de execucao. Ela nao pertence
ao Git, mas precisa permanecer no servidor entre deploys e reinicios. Inclua-a
no backup do alojamento e nunca execute uma implantacao que apague toda a raiz.

O utilizador da aplicacao precisa de permissao de leitura e escrita nessa pasta.
O Chromium usado pelo WhatsApp tambem precisa das bibliotecas Linux exigidas
pelo Puppeteer.

## 6. Configurar os agendamentos Cron

Crie chamadas protegidas pelo mesmo valor de `AUTOMATION_CRON_SECRET`:

```bash
curl -fsS -H "Authorization: Bearer SEU_SEGREDO" https://crm.seudominio.pt/api/automations/cron
curl -fsS -H "Authorization: Bearer SEU_SEGREDO" https://crm.seudominio.pt/api/flows/cron
curl -fsS -H "Authorization: Bearer SEU_SEGREDO" https://crm.seudominio.pt/api/clinic/appointments/reminders
```

Automacoes e fluxos podem rodar a cada minuto. Lembretes de agenda podem rodar
a cada 5 minutos.

## 7. Atualizar pelo Git

Antes de atualizar, confirme que `whatsapp_auth` esta fora de qualquer limpeza
do deploy. Depois:

```bash
git pull origin main
npm ci
npm run build
```

Reinicie a aplicacao no cPanel e valide `/login`, `/inbox`, `/agenda` e a pagina
de conexao WhatsApp. As migrations do Supabase devem ser aplicadas separadamente
e na ordem numerica; nunca sao executadas automaticamente pelo deploy.

## Diagnostico rapido

- `npm run build` falha: confira Node 20/22 e as variaveis `NEXT_PUBLIC_*`.
- Aplicacao retorna 503: confira `server.cjs`, `PORT` e o log do Passenger.
- QR nao aparece: confirme Chromium, memoria, escrita em `whatsapp_auth` e que
  o processo Node nao e suspenso.
- QR desconecta apos deploy: a pasta `whatsapp_auth` foi removida ou mudou de
  caminho/permissoes.
- Automacoes nao executam: confira Cron, URL HTTPS e o segredo Bearer.

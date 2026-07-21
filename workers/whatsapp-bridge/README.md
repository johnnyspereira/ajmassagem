# AJ Massagem WhatsApp Bridge

Worker local para manter a sessao WhatsApp QR fora do cPanel.

Arquitetura:

```text
CRM no cPanel -> HTTPS -> Cloudflare Tunnel/ngrok -> este worker no PC
este worker -> WhatsApp Web QR
este worker -> Supabase
```

## 1. Configurar `.env`

Copie `.env.example` para `.env` e preencha:

```env
PORT=4100
WORKER_SECRET=uma-chave-grande-igual-a-do-cpanel
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
ACCOUNT_ID=uuid-da-conta
USER_ID=uuid-do-proprietario-ou-usuario-bot
WHATSAPP_AUTH_DIR=./whatsapp_auth
```

`ACCOUNT_ID` e `USER_ID` tambem podem ser enviados pelo CRM nas chamadas.
Mesmo assim, deixar no `.env` ajuda o worker a restaurar a sessao sozinho
quando o PC reiniciar.

## 2. Instalar e iniciar no PC

Na raiz do CRM:

```bash
npm run worker:whatsapp:install
npm run worker:whatsapp:start
```

Ou dentro desta pasta:

```bash
npm install
npm start
```

Ao aparecer o QR no terminal, escaneie com o WhatsApp.

## 3. Publicar com Cloudflare Tunnel

Exemplo:

```bash
cloudflared tunnel --url http://localhost:4100
```

Use a URL HTTPS gerada como `WHATSAPP_WORKER_URL` no cPanel.
Para producao, crie um tunnel fixo, por exemplo:

```text
https://wa-worker.ajmassagem.pt
```

## 4. Variaveis no CRM/cPanel

No app Node.js do cPanel:

```env
WHATSAPP_MODE=remote_worker
WHATSAPP_WORKER_URL=https://wa-worker.ajmassagem.pt
WHATSAPP_WORKER_SECRET=mesmo-valor-de-WORKER_SECRET
PUPPETEER_SKIP_DOWNLOAD=true
NEXT_PUBLIC_APP_URL=https://suporte.ajmassagem.pt
```

O CRM passa a usar as mesmas rotas antigas:

```text
/api/whatsapp/baileys/status
/api/whatsapp/baileys/restart
/api/whatsapp/baileys/logout
/api/whatsapp/baileys/sync
/api/whatsapp/send
```

Mas, internamente, essas rotas chamam este worker.

## 5. Teste local

Com o worker rodando:

```bash
curl -H "Authorization: Bearer $WORKER_SECRET" http://localhost:4100/status
```

No Windows PowerShell:

```powershell
Invoke-WebRequest -Headers @{ Authorization = "Bearer $env:WORKER_SECRET" } http://localhost:4100/status
```

## Observacoes

- O PC precisa ficar ligado e sem suspensao.
- O worker precisa iniciar junto com o Windows para producao.
- Proteja `WORKER_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`.
- Se a service role key ja apareceu em print ou ambiente inseguro, gere uma nova no Supabase.

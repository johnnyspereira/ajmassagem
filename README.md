# AJ Massagem CRM cPanel runtime

Esta branch e gerada automaticamente pelo GitHub Actions.

No cPanel:
- Branch: cpanel-runtime
- Application startup file: server.js
- Execute `Run NPM Install` uma vez apos criar a aplicacao
- Nao execute `npm run build`
- As migrations MySQL pendentes sao aplicadas automaticamente no arranque
- Configure as variaveis de ambiente no Setup Node.js App
- Use Restart Application apos cada pull

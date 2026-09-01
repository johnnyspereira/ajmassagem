function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function brandedEmail(input: {
  businessName: string;
  preheader: string;
  eyebrow: string;
  title: string;
  greeting: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  action?: { label: string; url: string } | null;
  highlight?: { label: string; value: string } | null;
  notice?: string;
}) {
  const brand = input.businessName.trim() || 'JP Massagem';
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0;background:#f5f8f6;border:1px solid #e1e9e4;border-radius:14px">${input.details.map(({ label, value }, index) => `<tr><td style="padding:${index ? '0 20px 15px' : '18px 20px 15px'}"><div style="font-size:11px;line-height:16px;letter-spacing:.08em;text-transform:uppercase;color:#738078">${escapeHtml(label)}</div><div style="margin-top:3px;font-size:15px;line-height:22px;font-weight:600;color:#183025">${escapeHtml(value)}</div></td></tr>`).join('')}</table>`
    : '';
  const action = input.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 22px"><tr><td style="border-radius:10px;background:#0f9f8f"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:15px;font-weight:700">${escapeHtml(input.action.label)}</a></td></tr></table><p style="margin:0 0 24px;font-size:12px;line-height:18px;color:#738078;word-break:break-all">Se o botão não funcionar, copie este endereço:<br><a href="${escapeHtml(input.action.url)}" style="color:#0b7f74">${escapeHtml(input.action.url)}</a></p>`
    : '';
  const highlight = input.highlight
    ? `<div style="margin:24px 0;padding:18px 20px;border-radius:12px;background:#ecfdf8;border:1px solid #b9eee2"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#33776d">${escapeHtml(input.highlight.label)}</div><div style="margin-top:7px;font-size:23px;font-weight:800;letter-spacing:.06em;color:#0d584f">${escapeHtml(input.highlight.value)}</div></div>`
    : '';
  const notice = input.notice
    ? `<div style="margin-top:24px;padding:14px 16px;border-left:3px solid #d9a441;background:#fffaf0;color:#655430;font-size:13px;line-height:20px">${escapeHtml(input.notice)}</div>`
    : '';
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:#eef3f0;font-family:Arial,Helvetica,sans-serif;color:#183025"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f0;padding:30px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dce7e0;border-radius:20px;overflow:hidden;box-shadow:0 10px 35px rgba(18,55,38,.08)"><tr><td style="padding:27px 32px;background:#112d20;color:#fff"><table role="presentation" width="100%"><tr><td><div style="display:inline-block;padding:8px 10px;border-radius:9px;background:#12a594;color:#fff;font-size:14px;font-weight:800">JP</div><span style="margin-left:10px;font-size:18px;font-weight:700">${escapeHtml(brand)}</span></td><td align="right" style="font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:#b6d2c2">${escapeHtml(input.eyebrow)}</td></tr></table></td></tr><tr><td style="padding:36px 32px"><p style="margin:0 0 10px;font-size:16px;line-height:24px;color:#4f6258">${escapeHtml(input.greeting)}</p><h1 style="margin:0 0 16px;font-size:28px;line-height:35px;color:#112d20">${escapeHtml(input.title)}</h1><p style="margin:0;font-size:16px;line-height:26px;color:#4f6258">${escapeHtml(input.message)}</p>${details}${highlight}${action}${notice}<p style="margin:30px 0 0;font-size:14px;line-height:22px;color:#617269">Com os melhores cumprimentos,<br><strong style="color:#183025">Equipa ${escapeHtml(brand)}</strong></p></td></tr><tr><td style="padding:18px 32px;background:#f7faf8;border-top:1px solid #e7ede9;font-size:11px;line-height:17px;color:#7a887f">Mensagem automática e confidencial enviada pela ${escapeHtml(brand)}. Por favor, não partilhe links pessoais ou palavras-passe.</td></tr></table></td></tr></table></body></html>`;
}

export function portalAccessEmail(input: {
  businessName: string;
  clientName?: string | null;
  portalUrl: string;
  password: string;
}) {
  const firstName = input.clientName?.trim().split(/\s+/)[0] || 'cliente';
  const business = input.businessName || 'JP Massagem';
  return {
    subject: `${business} · O seu acesso ao Portal 360`,
    text: `Olá, ${firstName}. O seu acesso ao Portal 360 da ${business} está pronto. Entre em ${input.portalUrl} e utilize a palavra-passe temporária ${input.password}. No primeiro acesso, defina uma nova palavra-passe.`,
    html: brandedEmail({
      businessName: business,
      preheader: 'O seu acesso privado ao Portal 360 está pronto.',
      eyebrow: 'Portal 360',
      title: 'O seu acesso está pronto',
      greeting: `Olá, ${firstName}.`,
      message:
        'Consulte as suas marcações, benefícios, documentos e pedidos num espaço privado e seguro.',
      action: { label: 'Entrar no Portal 360', url: input.portalUrl },
      highlight: { label: 'Palavra-passe temporária', value: input.password },
      notice:
        'No primeiro acesso será solicitado que escolha uma nova palavra-passe. Este link é pessoal e de utilização única.',
    }),
  };
}

export function passwordResetEmail(input: {
  businessName?: string;
  resetUrl: string;
}) {
  const business = input.businessName || 'JP Massagem';
  return {
    subject: `${business} · Recuperar acesso`,
    text: `Recebemos um pedido para alterar a sua palavra-passe. Use este link durante os próximos 30 minutos: ${input.resetUrl}. Se não fez este pedido, ignore esta mensagem.`,
    html: brandedEmail({
      businessName: business,
      preheader: 'Defina uma nova palavra-passe com segurança.',
      eyebrow: 'Segurança',
      title: 'Recuperar acesso',
      greeting: 'Olá.',
      message:
        'Recebemos um pedido para alterar a palavra-passe da sua conta. O botão abaixo é válido durante 30 minutos.',
      action: { label: 'Definir nova palavra-passe', url: input.resetUrl },
      notice:
        'Se não pediu esta alteração, pode ignorar este email. A sua palavra-passe atual continuará válida.',
    }),
  };
}

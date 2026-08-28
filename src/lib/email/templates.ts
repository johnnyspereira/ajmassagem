function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function portalAccessEmail(input: {
  businessName: string;
  clientName?: string | null;
  portalUrl: string;
  password: string;
}) {
  const business = escapeHtml(input.businessName || 'JP Massagem');
  const firstName = escapeHtml(
    input.clientName?.trim().split(/\s+/)[0] || 'cliente'
  );
  const url = escapeHtml(input.portalUrl);
  const password = escapeHtml(input.password);
  return {
    subject: `${business} · Acesso ao Portal 360`,
    text: `Olá ${firstName}. O seu acesso ao Portal 360 da ${input.businessName} está pronto. Entre em ${input.portalUrl} e utilize a palavra-passe temporária ${input.password}. No primeiro acesso, defina uma nova palavra-passe.`,
    html: `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,sans-serif;color:#17251c"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px;background:#f3f5f4"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dfe6e1"><tr><td style="padding:28px 34px;background:#16251c;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#b9d3c2">Portal 360</div><h1 style="margin:10px 0 0;font-size:26px">${business}</h1></td></tr><tr><td style="padding:34px"><p style="margin:0 0 14px;font-size:17px">Olá, ${firstName}.</p><h2 style="margin:0 0 12px;font-size:24px;color:#17251c">O seu acesso está pronto</h2><p style="margin:0 0 24px;line-height:1.65;color:#526158">Consulte as suas marcações, benefícios e documentos num espaço privado.</p><p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:9px">Entrar no Portal 360</a></p><div style="padding:18px;border-radius:10px;background:#f4f0ff;border:1px solid #e4d8ff"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6d5a91">Palavra-passe temporária</div><div style="margin-top:8px;font-size:24px;font-weight:bold;letter-spacing:.08em;color:#4c1d95">${password}</div></div><p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#68756d">Por segurança, será solicitado que escolha uma nova palavra-passe no primeiro acesso. Não partilhe este email.</p></td></tr><tr><td style="padding:18px 34px;background:#f8faf9;font-size:12px;color:#738078">Mensagem automática enviada pela ${business}.</td></tr></table></td></tr></table></body></html>`,
  };
}

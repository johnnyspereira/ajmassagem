import { describe, expect, it } from 'vitest';

import { passwordResetEmail, portalAccessEmail } from './templates';

describe('portalAccessEmail', () => {
  it('renders the branded access action and temporary password', () => {
    const email = portalAccessEmail({
      businessName: 'JP Massagem',
      clientName: 'Maria Silva',
      portalUrl: 'https://jpmassagem.pt/portal?portal_token=abc',
      password: 'WA-ABCDE-12345',
    });

    expect(email.subject).toContain('JP Massagem');
    expect(email.html).toContain('Entrar no Portal 360');
    expect(email.html).toContain('WA-ABCDE-12345');
    expect(email.text).toContain('jpmassagem.pt/portal');
  });

  it('escapes client-controlled HTML values', () => {
    const email = portalAccessEmail({
      businessName: '<script>alert(1)</script>',
      clientName: '<img>',
      portalUrl: 'https://example.com/?x=1&y=2',
      password: '<unsafe>',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img>');
    expect(email.html).toContain('&lt;unsafe&gt;');
  });
});

describe('passwordResetEmail', () => {
  it('renders the branded secure recovery action', () => {
    const email = passwordResetEmail({
      resetUrl: 'https://jpmassagem.pt/auth/callback?code=abc',
    });

    expect(email.subject).toContain('Recuperar acesso');
    expect(email.html).toContain('Definir nova palavra-passe');
    expect(email.html).toContain('jpmassagem.pt/auth/callback');
    expect(email.text).toContain('30 minutos');
  });
});

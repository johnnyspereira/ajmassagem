import { expect, it } from 'vitest';
import { googleReviewInvitation } from './google-review-invitation';
it('invites a renewed review on the new page with optional comments or stars and a real configured URL', () => {
  const message = googleReviewInvitation('  Maria Silva ', 'JP Massagem', 'https://g.page/r/new/review');
  expect(message).toContain('Olá, Maria!');
  expect(message).toContain('nova página no Google');
  expect(message).toContain('página anterior');
  expect(message).toContain('apenas as estrelas que refletem a sua opinião');
  expect(message).toContain('https://g.page/r/new/review');
  expect(message).not.toContain('Maria Silva');
});
it('handles an unnamed contact without inventing personal information', () => {
  expect(googleReviewInvitation(null, '', 'https://g.page/r/new/review')).toMatch(/^Olá!\n\nAqui é da JP Massagem/);
});
it('never prepares an invitation without a valid configured link', () => {
  expect(() => googleReviewInvitation('Nome', 'JP Massagem', null)).toThrow();
});

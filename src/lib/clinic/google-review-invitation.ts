import { normalizeReviewUrl } from './review-link';

export function googleReviewInvitation(
  name: string | null,
  company: string,
  link: unknown
) {
  const url = normalizeReviewUrl(link);
  const firstName = name?.trim().split(/\s+/)[0];
  return `${firstName ? `Olá, ${firstName}!` : 'Olá!'}

Aqui é da ${company.trim() || 'JP Massagem'}. Criámos uma nova página no Google e gostaríamos de voltar a contar com a sua opinião sobre o nosso atendimento.

Mesmo que já nos tenha avaliado na página anterior, uma nova avaliação nesta página seria uma grande ajuda. Pode partilhar a sua experiência num breve comentário ou deixar apenas as estrelas que refletem a sua opinião.

Pode avaliar aqui:
${url}

Muito obrigado pelo seu tempo e por fazer parte da nossa história!
${company.trim() || 'JP Massagem'}`;
}

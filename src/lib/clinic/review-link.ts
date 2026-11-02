export type ReviewLinkMode = 'system' | 'google';
/** A stale Clinic form must not overwrite the destination managed in its own panel. */
export function withoutReviewLinkSettings(value: object) {
  const payload = { ...value } as Record<string, unknown>;
  delete payload.review_link_mode;
  delete payload.review_google_url;
  return payload;
}
export function parseReviewMode(value: unknown): ReviewLinkMode {
  if (value === 'system' || value === 'google') return value;
  throw new Error('Escolha avaliação do sistema ou Google / link externo.');
}
export function normalizeReviewUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(
      'Indique o link de avaliação do Google ou outro endereço externo.'
    );
  const input = value.trim();
  if (input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input))
    throw new Error('Use um endereço HTTPS válido, sem espaços.');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Use um endereço HTTPS completo.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname
  )
    throw new Error('Use um endereço HTTPS sem credenciais.');
  return url.href;
}
export function reviewRequestUrl(
  mode: unknown,
  googleUrl: unknown,
  systemUrl: string
) {
  const destination = parseReviewMode(mode ?? 'system');
  return {
    mode: destination,
    url: destination === 'google' ? normalizeReviewUrl(googleUrl) : systemUrl,
  };
}

/**
 * Resolve an absolute URL for links that leave the browser, such as links sent
 * by email. The browser origin can be an internal bind address (0.0.0.0), so a
 * configured public site URL must take precedence.
 */
export function getPublicUrl(path: string, browserOrigin: string): string {
  const configuredOrigin =
    process.env.CANONICAL_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const configured = validOrigin(configuredOrigin);
  const requestOrigin = validOrigin(browserOrigin);
  // The Node runtime behind cPanel is reachable on a private :3000 URL. That
  // address must never escape in customer emails, even when cPanel omitted the
  // public URL variables from its environment.
  const origin =
    (configured && !isInternalRuntimeOrigin(configured) ? configured : null) ||
    (requestOrigin && !isInternalRuntimeOrigin(requestOrigin)
      ? requestOrigin
      : 'https://jpmassagem.pt');
  if (!origin) throw new Error('Nenhuma URL pública válida foi configurada.');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${origin}${normalizedPath}`;
}

function validOrigin(value: string | undefined) {
  if (!value) return null;
  const unquoted = value.trim().replace(/^["']|["']$/g, '');
  if (/^https?:\/?\/?$/i.test(unquoted)) return null;
  const cleaned = unquoted.replace(/\/+$/, '');
  const candidate = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname)
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isInternalRuntimeOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      url.hostname === '0.0.0.0' ||
      url.hostname.endsWith('.dnscpanel.com')
    );
  } catch {
    return true;
  }
}

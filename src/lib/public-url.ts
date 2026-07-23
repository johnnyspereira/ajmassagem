/**
 * Resolve an absolute URL for links that leave the browser, such as links sent
 * by email. The browser origin can be an internal bind address (0.0.0.0), so a
 * configured public site URL must take precedence.
 */
export function getPublicUrl(path: string, browserOrigin: string): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = (configuredOrigin || browserOrigin).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${origin}${normalizedPath}`;
}

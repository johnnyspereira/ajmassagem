import { createHash } from 'node:crypto';

export const RECOVERY_COOKIE = 'wacrm_password_recovery';
export const RECOVERY_TOKEN_TTL_SECONDS = 30 * 60;

/** Recovery tokens are generated with randomBytes(32). Keep parsing strict so a
 * malformed URL or cookie never reaches the database query. */
export function isRecoveryToken(value: string | null | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{40,128}$/.test(value));
}

export function hashRecoveryToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Only allow a path within this application. In particular, //host must not
 * become an external redirect when passed to new URL(). */
export function safeInternalPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}

/** WhatsApp sometimes serializes media bytes into body instead of a caption. */
export function isEncodedMediaText(value?: string | null): boolean {
  const text = value?.trim() || '';
  if (/^data:(?:image|audio|video|application)\/[^,]+;base64,/i.test(text))
    return true;
  const compact = text.replace(/\s/g, '');
  return compact.length >= 80 && /^[A-Za-z0-9+/_=-]+$/.test(compact);
}
export function visibleMessageText(value?: string | null): string {
  return isEncodedMediaText(value) ? '' : value || '';
}

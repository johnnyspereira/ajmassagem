export function portalAuthEmail(accountId: string, contactId: string) {
  return `portal-${accountId}.${contactId}@portal.invalid`.toLowerCase();
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WHATSAPP_MODE === 'remote_worker') return;

  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<typeof import('./lib/whatsapp/baileys')>;
  const { bootstrapBaileysSessionFromSavedAuth } =
    await dynamicImport('./lib/whatsapp/baileys');
  bootstrapBaileysSessionFromSavedAuth();
}

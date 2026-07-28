export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WHATSAPP_MODE === 'remote_worker') return;

  const { bootstrapBaileysSessionFromSavedAuth } =
    await import('./lib/whatsapp/baileys');
  bootstrapBaileysSessionFromSavedAuth();
}

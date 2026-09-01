import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendLocalEmail } from '@/lib/email/smtp';
import { voucherDeliveryEmail } from '@/lib/email/templates';
import { getPublicUrl } from '@/lib/public-url';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    saleId?: string;
  } | null;
  if (!body?.saleId)
    return Response.json({ error: 'Venda inválida.' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: profile } = await db
    .from('profiles')
    .select('account_id,account_role')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!profile || !['owner', 'admin', 'agent'].includes(profile.account_role))
    return Response.json({ error: 'Sem permissão.' }, { status: 403 });

  const [{ data: account }, { data: vouchers, error }] = await Promise.all([
    db
      .from('accounts')
      .select('name')
      .eq('id', profile.account_id)
      .maybeSingle(),
    db
      .from('finance_vouchers')
      .select(
        'id,code,pin_code,voucher_type,initial_balance,currency,recipient_name,message,expires_at,status,owner:contacts(name,email),service:clinic_services(name)'
      )
      .eq('account_id', profile.account_id)
      .eq('issued_sale_id', body.saleId)
      .eq('status', 'active'),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const voucher of vouchers ?? []) {
    const owner = Array.isArray(voucher.owner)
      ? voucher.owner[0]
      : voucher.owner;
    const service = Array.isArray(voucher.service)
      ? voucher.service[0]
      : voucher.service;
    if (!owner?.email) {
      skipped += 1;
      continue;
    }
    const benefit =
      voucher.voucher_type === 'service'
        ? service?.name || 'Voucher de serviço'
        : new Intl.NumberFormat('pt-PT', {
            style: 'currency',
            currency: voucher.currency || 'EUR',
          }).format(Number(voucher.initial_balance));
    const voucherUrl = getPublicUrl(
      `/voucher/${encodeURIComponent(voucher.id)}?pin=${encodeURIComponent(voucher.pin_code || '')}`,
      new URL(request.url).origin
    );
    try {
      await sendLocalEmail({
        to: owner.email,
        ...voucherDeliveryEmail({
          businessName: account?.name || 'JP Massagem',
          clientName: owner.name,
          recipientName: voucher.recipient_name,
          voucherUrl,
          code: voucher.code,
          pin: voucher.pin_code || '',
          benefit,
          expiresAt: voucher.expires_at,
          message: voucher.message,
        }),
      });
      sent += 1;
    } catch (cause) {
      failures.push(cause instanceof Error ? cause.message : 'Falha no email.');
    }
  }
  if (!(vouchers ?? []).length) {
    return Response.json(
      { error: 'A venda ainda não está paga ou não possui vouchers ativos.' },
      { status: 409 }
    );
  }
  return Response.json({ sent, skipped, failures });
}

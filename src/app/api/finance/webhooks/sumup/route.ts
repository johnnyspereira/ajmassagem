import { NextResponse, type NextRequest } from 'next/server';
import { sumUpRequest } from '@/lib/finance/sumup';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type Webhook = { id?: string; event_type?: string };
type Checkout = { id?: string; status?: string; transaction_id?: string; amount?: number; currency?: string; checkout_reference?: string };

export async function POST(request: NextRequest) {
  const event = await request.json().catch(() => null) as Webhook | null;
  if (!event?.id) return NextResponse.json({ error: 'Evento SumUp inválido.' }, { status: 400 });
  try {
    const response = await sumUpRequest(`/v0.1/checkouts/${encodeURIComponent(event.id)}`);
    const checkout = await response.json().catch(() => ({})) as Checkout;
    if (!response.ok || !checkout.id) return NextResponse.json({ error: 'Não foi possível confirmar o checkout na SumUp.' }, { status: 400 });

    const db = createAdminClient();
    if (checkout.status === 'PAID') {
      const { error } = await db.rpc('confirm_external_payment_link', {
        p_provider: 'sumup',
        p_external_session_id: checkout.id,
        p_external_payment_intent_id: checkout.transaction_id ?? null,
        p_payload: { event_type: event.event_type ?? null, status: checkout.status, amount: checkout.amount, currency: checkout.currency, checkout_reference: checkout.checkout_reference },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao validar webhook SumUp.' }, { status: 500 });
  }
}

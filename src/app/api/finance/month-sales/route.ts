import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { financeMonthRange } from '@/lib/finance/month-workspace';
export async function GET(request: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent');
    let range;
    try {
      range = financeMonthRange(
        new URL(request.url).searchParams.get('month') || ''
      );
    } catch {
      return Response.json(
        { error: 'Escolha um mês válido.' },
        { status: 400 }
      );
    }
    const saleId = new URL(request.url).searchParams.get('sale');
    let query = supabase
      .from('finance_sales')
      .select(
        '*, contact:contacts(*), items:finance_sale_items(*), payments:finance_payments(*)'
      )
      .eq('account_id', accountId);
    query = saleId
      ? query.eq('id', saleId)
      : query
          .gte('created_at', range.start.toISOString())
          .lt('created_at', range.end.toISOString());
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return Response.json(
      { sales: data || [] },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

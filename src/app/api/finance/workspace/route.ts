import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  financeMonthRange,
  loadFinanceMonth,
} from '@/lib/finance/month-workspace';
export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const month = new URL(request.url).searchParams.get('month') || '';
    try {
      financeMonthRange(month);
    } catch {
      return Response.json(
        { error: 'Escolha um mês válido.' },
        { status: 400 }
      );
    }
    return Response.json(await loadFinanceMonth(accountId, month), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

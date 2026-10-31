import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadAttention } from '@/lib/dashboard/attention';
import {
  ATTENTION_KINDS,
  type AttentionKind,
} from '@/lib/dashboard/attention-types';

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind') || 'all';
    const rawPage = params.get('page') || '0';
    const search = (params.get('q') || '').trim();
    if (
      (kind !== 'all' && !ATTENTION_KINDS.includes(kind as AttentionKind)) ||
      !/^\d{1,6}$/.test(rawPage) ||
      search.length > 100
    )
      return Response.json(
        { error: 'Filtro, pesquisa ou página inválidos.' },
        { status: 400 }
      );
    return Response.json(
      await loadAttention(
        accountId,
        kind as AttentionKind | 'all',
        Number(rawPage),
        search
      ),
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

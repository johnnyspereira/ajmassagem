import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';
import {
  HistoricalError,
  historicalCutoff,
  readHistoricalCandidates,
  commitHistoricalAppointments,
} from '@/lib/dashboard/historical-appointments';

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('owner');
    const body = await request.json().catch(() => null);
    if (!body || !['preview', 'commit'].includes(body.action))
      throw new HistoricalError('Pedido inválido.', 400);
    const cutoff = historicalCutoff(body.before);
    if (body.action === 'preview') {
      if (typeof body.search !== 'string' || body.search.length > 100)
        throw new HistoricalError('Pesquisa inválida.', 400);
      const result = await transaction((connection) =>
        readHistoricalCandidates(
          connection,
          accountId,
          cutoff,
          body.search.trim()
        )
      );
      return Response.json(
        { candidates: result.candidates },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    const selected = body.selected;
    if (
      body.authorized !== true ||
      typeof body.reason !== 'string' ||
      body.reason.trim().length < 5 ||
      body.reason.length > 500 ||
      !Array.isArray(selected) ||
      !selected.length ||
      selected.length > 200 ||
      selected.some(
        (s) =>
          !s ||
          typeof s.id !== 'string' ||
          !/^[\da-f-]{36}$/i.test(s.id) ||
          typeof s.revision !== 'string' ||
          !/^[\da-f]{64}$/i.test(s.revision)
      ) ||
      new Set(selected.map((s) => s.id)).size !== selected.length
    )
      throw new HistoricalError(
        'Selecione os atendimentos e confirme a autorização com um motivo de 5 a 500 caracteres.',
        400
      );
    const result = await transaction((connection) =>
      commitHistoricalAppointments(
        connection,
        accountId,
        userId,
        cutoff,
        selected,
        body.reason.trim()
      )
    );
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof HistoricalError)
      return Response.json({ error: error.message }, { status: error.status });
    return toErrorResponse(error);
  }
}

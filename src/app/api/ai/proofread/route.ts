import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadAiConfig } from '@/lib/ai/config';
import { generateReply } from '@/lib/ai/generate';
import { AiError } from '@/lib/ai/types';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

const MAX_TEXT_LENGTH = 8_000;

/** Corrects only the local Inbox draft. It never sends or stores a message. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`ai-proofread:${userId}`, RATE_LIMITS.aiDraft);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `text must be at most ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
    }

    const config = await loadAiConfig(supabase, accountId, { requireActive: false }).catch(() => {
      throw new AiError('A configuraÃ§Ã£o de IA nÃ£o pÃ´de ser lida.', { code: 'key_decrypt_failed', status: 400 });
    });
    if (!config) {
      return NextResponse.json({ error: 'O corretor por IA ainda nÃ£o estÃ¡ configurado.', code: 'ai_not_configured' }, { status: 400 });
    }

    const { text: corrected } = await generateReply({
      config,
      systemPrompt:
        'You are an exact Portuguese writing proofreader for WhatsApp messages. ' +
        'Return only the corrected version of the supplied text. Preserve the original meaning, tone, language, line breaks, names, numbers, URLs, emojis and WhatsApp formatting (*bold*, _italic_, ~strikethrough~). ' +
        'Correct spelling, accents, punctuation and obvious grammatical agreement only. Do not add greetings, explanations, quotation marks or new information.',
      messages: [{ role: 'user', content: text }],
    });
    if (!corrected) throw new AiError('O corretor devolveu uma resposta vazia.');
    return NextResponse.json({ corrected });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return toErrorResponse(error);
  }
}

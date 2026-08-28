import type { RowDataPacket } from 'mysql2';

import { registerOwner } from '@/lib/auth/service';
import { createSession } from '@/lib/auth/session';
import { selectRows } from '@/lib/mysql/db';

type CountRow = RowDataPacket & { total: number };

async function installationState() {
  const rows = await selectRows<CountRow[]>('SELECT COUNT(*) AS total FROM app_users');
  return { installed: Number(rows[0]?.total ?? 0) > 0, database: 'connected' as const };
}

export async function GET() {
  try {
    return Response.json(await installationState());
  } catch (error) {
    return Response.json(
      { installed: false, database: 'error', error: error instanceof Error ? error.message : 'MySQL connection failed.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if ((await installationState()).installed) {
      return Response.json({ error: 'A instalação inicial já foi concluída.' }, { status: 409 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const fullName = String(body.fullName ?? '').trim();
    const accountName = String(body.accountName ?? '').trim();
    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    if (!fullName || !accountName || !email || password.length < 8) {
      return Response.json({ error: 'Preencha todos os campos; a senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }
    const user = await registerOwner({ fullName, accountName, email, password });
    await createSession(user.id);
    return Response.json({ success: true, user }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível concluir a instalação.' }, { status: 400 });
  }
}

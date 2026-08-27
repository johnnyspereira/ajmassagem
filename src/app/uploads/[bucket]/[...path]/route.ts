import { loadObject } from '@/lib/storage/local-storage';

export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  try { const value = await params; const body = await loadObject(value.bucket, value.path.join('/')); return new Response(body, { headers: { 'Cache-Control': 'public,max-age=3600', 'X-Content-Type-Options': 'nosniff' } }); }
  catch { return new Response('Not found', { status: 404 }); }
}

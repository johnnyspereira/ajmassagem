'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Camera, CheckCircle2, Clock3, ImagePlus, Loader2, MessageCircle, MonitorPlay, RefreshCw, Send, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type SocialPostType = 'instagram_feed' | 'instagram_reel' | 'instagram_story' | 'whatsapp_campaign' | 'whatsapp_status_reminder';
type SocialPostStatus = 'draft' | 'scheduled' | 'ready' | 'publishing' | 'published' | 'failed' | 'cancelled';
type SocialPost = { id: string; platform: 'instagram' | 'whatsapp'; post_type: SocialPostType; status: SocialPostStatus; title: string; caption: string; media_url: string | null; scheduled_at: string | null; published_at: string | null; last_error: string | null; created_at: string };

const OPTIONS: Array<{ value: SocialPostType; label: string; description: string; platform: 'instagram' | 'whatsapp'; icon: typeof Camera }> = [
  { value: 'instagram_feed', label: 'Post', description: 'Publicação no Feed', platform: 'instagram', icon: Camera },
  { value: 'instagram_reel', label: 'Reel', description: 'Vídeo vertical', platform: 'instagram', icon: Video },
  { value: 'instagram_story', label: 'Story Instagram', description: 'Story da Meta', platform: 'instagram', icon: MonitorPlay },
  { value: 'whatsapp_status_reminder', label: 'Status WhatsApp', description: 'Publica pelo worker QR', platform: 'whatsapp', icon: MessageCircle },
  { value: 'whatsapp_campaign', label: 'Campanha WhatsApp', description: 'Mensagem para clientes', platform: 'whatsapp', icon: Send },
];
const STATUS_STYLE: Record<SocialPostStatus, string> = { draft: 'bg-slate-500/10 text-slate-600 border-slate-500/20', scheduled: 'bg-blue-500/10 text-blue-600 border-blue-500/20', ready: 'bg-violet-500/10 text-violet-600 border-violet-500/20', publishing: 'bg-amber-500/10 text-amber-700 border-amber-500/20', published: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', failed: 'bg-red-500/10 text-red-600 border-red-500/20', cancelled: 'bg-slate-500/10 text-slate-600 border-slate-500/20' };
const STATUS_LABEL: Record<SocialPostStatus, string> = { draft: 'Rascunho', scheduled: 'Agendado', ready: 'Pronto', publishing: 'A publicar', published: 'Publicado', failed: 'Falhou', cancelled: 'Cancelado' };

function localDateTime(value = new Date(Date.now() + 60 * 60 * 1000)) { const offset = value.getTimezoneOffset() * 60_000; return new Date(value.getTime() - offset).toISOString().slice(0, 16); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sem agendamento'; }
function isVideo(url: string) { return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url); }
function optionFor(type: SocialPostType) { return OPTIONS.find((option) => option.value === type) ?? OPTIONS[0]; }

export function SocialPlannerPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, profile } = useAuth();
  const canSend = useCan('send-messages');
  const inputRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [type, setType] = useState<SocialPostType>('whatsapp_status_reminder');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState(localDateTime);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [instagram, setInstagram] = useState<{ instagram_username: string | null } | null>(null);
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const selected = optionFor(type);

  const loadPosts = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase.from('social_scheduled_posts').select('id,platform,post_type,status,title,caption,media_url,scheduled_at,published_at,last_error,created_at').eq('account_id', accountId).order('scheduled_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) toast.error(`Não foi possível carregar: ${error.message}`); else setPosts((data ?? []) as SocialPost[]);
    setLoading(false);
  }, [accountId, supabase]);
  useEffect(() => { void loadPosts(); }, [loadPosts]);
  useEffect(() => {
    fetch('/api/social/instagram').then(async (response) => {
      if (!response.ok) return;
      const payload = (await response.json()) as { connection?: { instagram_username: string | null } | null };
      setInstagram(payload.connection ?? null);
    }).catch(() => undefined);
  }, []);

  async function connectInstagram() {
    setConnectingInstagram(true);
    try {
      const response = await fetch('/api/social/instagram/connect', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error || 'NÃ£o foi possÃ­vel iniciar a ligaÃ§Ã£o.');
      window.location.assign(payload.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'NÃ£o foi possÃ­vel ligar o Instagram.');
      setConnectingInstagram(false);
    }
  }

  async function uploadMedia(file: File) {
    if (file.size > 16 * 1024 * 1024) return toast.error('A mídia pode ter no máximo 16 MB.');
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return toast.error('Escolha uma imagem ou vídeo.');
    setUploading(true);
    try {
      const formData = new FormData(); formData.set('file', file);
      const response = await fetch('/api/storage/social-media/upload', { method: 'POST', body: formData });
      const payload = (await response.json().catch(() => null)) as { data?: { publicUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.data?.publicUrl) throw new Error(payload?.error?.message || 'Não foi possível carregar a mídia.');
      setMediaUrl(payload.data.publicUrl);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replaceAll(/[-_]+/g, ' '));
      toast.success('Mídia carregada.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha no upload.'); } finally { setUploading(false); }
  }

  async function createPost() {
    if (!accountId || !profile?.id || !canSend) return;
    if (!title.trim()) return toast.error('Dê um título interno ao conteúdo.');
    if (!caption.trim() && !mediaUrl) return toast.error('Escreva uma mensagem ou escolha uma mídia.');
    if (selected.platform === 'instagram' && !instagram) {
      return toast.error('Ligue primeiro a conta profissional Instagram para agendar publicaÃ§Ãµes.');
    }
    const scheduled = saveAsDraft ? null : new Date(scheduledAt);
    if (!saveAsDraft && (Number.isNaN(scheduled?.getTime()) || scheduled!.getTime() <= Date.now())) return toast.error('Escolha uma data e hora futuras, ou guarde como rascunho.');
    setSaving(true);
    const { error } = await supabase.from('social_scheduled_posts').insert({ account_id: accountId, created_by: profile.id, platform: selected.platform, post_type: type, status: saveAsDraft ? 'draft' : 'scheduled', title: title.trim(), caption: caption.trim(), media_url: mediaUrl || null, hashtags: [], scheduled_at: scheduled?.toISOString() ?? null, provider_payload: type === 'whatsapp_status_reminder' ? { source: 'social_planner', whatsapp_status_beta: true, delivery_mode: 'local_worker_prototype' } : { source: 'social_planner' } });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(saveAsDraft ? 'Rascunho guardado.' : 'Publicação agendada.');
    setTitle(''); setCaption(''); setMediaUrl(''); setScheduledAt(localDateTime()); setSaveAsDraft(false); await loadPosts();
  }

  async function publishNow(post: SocialPost) {
    const isInstagram = post.platform === 'instagram';
    if (!window.confirm(`Publicar agora ${isInstagram ? 'no Instagram' : 'no Status WhatsApp'}?\n\n${post.title}`)) return;
    setPublishingId(post.id);
    try {
      const response = await fetch(isInstagram ? '/api/social/posts/publish' : '/api/whatsapp/status/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId: post.id }) });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Não foi possível publicar.');
      toast.success('Status publicado no WhatsApp.'); await loadPosts();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível publicar.'); } finally { setPublishingId(null); }
  }
  async function cancel(post: SocialPost) { const { error } = await supabase.from('social_scheduled_posts').update({ status: 'cancelled' }).eq('id', post.id).eq('account_id', accountId); if (error) toast.error(error.message); else { toast.success('Publicação cancelada.'); await loadPosts(); } }
  const active = posts.filter((post) => !['published', 'cancelled'].includes(post.status));
  const history = posts.filter((post) => ['published', 'cancelled', 'failed'].includes(post.status));

  return <div className="mx-auto max-w-6xl space-y-6 p-3 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-primary text-sm font-semibold">MARKETING</p><h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight">Centro de publicações</h1><p className="text-muted-foreground mt-2">Crie, agende e acompanhe Stories, Posts e Status WhatsApp num único lugar.</p></div><div className="flex flex-wrap gap-2"><Button variant={instagram ? 'outline' : 'default'} onClick={() => !instagram && void connectInstagram()} disabled={connectingInstagram}>{connectingInstagram ? <Loader2 className="animate-spin" /> : <MonitorPlay />}{instagram ? `Instagram${instagram.instagram_username ? ` @${instagram.instagram_username}` : ' ligado'}` : 'Ligar Instagram'}</Button><Button variant="outline" onClick={() => void loadPosts()} disabled={loading}><RefreshCw className={cn(loading && 'animate-spin')} /> Atualizar</Button></div></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
      <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/20"><CardTitle>Criar publicação</CardTitle><CardDescription>Escolha onde quer publicar e complete os três passos abaixo.</CardDescription></CardHeader><CardContent className="space-y-7 p-5 md:p-6">
        <section className="space-y-3"><Step number="1" title="Onde quer publicar?" /><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{OPTIONS.map((option) => { const Icon = option.icon; const checked = option.value === type; return <button key={option.value} type="button" onClick={() => setType(option.value)} disabled={!canSend || saving} className={cn('rounded-xl border p-3 text-left transition hover:border-primary/50', checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card')}><Icon className={cn('mb-3 size-5', option.platform === 'whatsapp' ? 'text-emerald-500' : 'text-pink-500')} /><p className="text-sm font-semibold">{option.label}</p><p className="text-muted-foreground mt-0.5 text-xs">{option.description}</p></button>; })}</div></section>
        <section className="space-y-3"><Step number="2" title="Conteúdo" /><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título interno — ex.: Promoção de outono" disabled={!canSend || saving} /><Textarea value={caption} onChange={(event) => setCaption(event.target.value)} placeholder={type === 'whatsapp_status_reminder' ? 'Texto do seu Status...' : 'Escreva a legenda ou mensagem...'} rows={5} disabled={!canSend || saving} /><input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); event.currentTarget.value = ''; }} />{mediaUrl ? <MediaPreview url={mediaUrl} onRemove={() => setMediaUrl('')} /> : <button type="button" onClick={() => inputRef.current?.click()} disabled={!canSend || saving || uploading} className="border-border bg-muted/20 hover:border-primary/50 flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed p-5 transition">{uploading ? <Loader2 className="text-primary mb-2 size-7 animate-spin" /> : <ImagePlus className="text-primary mb-2 size-7" />}<span className="font-medium">{uploading ? 'A carregar mídia...' : 'Escolher imagem ou vídeo do computador'}</span><span className="text-muted-foreground mt-1 text-xs">JPG, PNG, WEBP, MP4 ou MOV · até 16 MB</span></button>}<div className="flex items-center gap-2"><span className="text-muted-foreground text-xs">ou</span><Input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Cole uma URL pública de mídia" disabled={!canSend || saving || uploading} /></div></section>
        <section className="space-y-3"><Step number="3" title="Quando publicar?" /><Input type="datetime-local" value={scheduledAt} min={localDateTime(new Date())} onChange={(event) => setScheduledAt(event.target.value)} disabled={!canSend || saving || saveAsDraft} /><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={saveAsDraft} onChange={(event) => setSaveAsDraft(event.target.checked)} disabled={!canSend || saving} className="accent-primary size-4" /> Guardar como rascunho — publicar mais tarde</label>{type === 'whatsapp_status_reminder' ? <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><MessageCircle className="mr-1 inline size-4" /> Com sessão QR ligada, o worker publica automaticamente no Status na hora escolhida.</div> : null}</section>
        <Button className="w-full" size="lg" onClick={() => void createPost()} disabled={!canSend || saving || uploading}><CalendarClock />{saving ? 'A guardar...' : saveAsDraft ? 'Guardar rascunho' : 'Agendar publicação'}</Button>
      </CardContent></Card>
      <aside className="space-y-4"><Card><CardContent className="p-5"><p className="text-muted-foreground text-xs font-medium">NA FILA</p><p className="mt-1 text-3xl font-bold">{active.length}</p><p className="text-muted-foreground text-sm">publicações pendentes</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-muted-foreground text-xs font-medium">PUBLICADAS</p><p className="mt-1 text-3xl font-bold">{posts.filter((post) => post.status === 'published').length}</p><p className="text-muted-foreground text-sm">no histórico</p></CardContent></Card><Card className="border-amber-500/20 bg-amber-500/5"><CardContent className="p-5"><p className="font-semibold text-amber-800 dark:text-amber-300">Status WhatsApp</p><p className="text-muted-foreground mt-2 text-sm">É publicado pela sessão WhatsApp Web do worker local. Mantenha o PC, worker e QR ligados na hora agendada.</p></CardContent></Card></aside>
    </div>
    <PostList title="Próximas publicações" description="Tudo o que está agendado, pronto ou em rascunho." posts={active} loading={loading} empty="Ainda não há conteúdo agendado." onPublish={publishNow} onCancel={cancel} publishingId={publishingId} />
    <PostList title="Histórico" description="Publicações concluídas, canceladas ou com falha." posts={history} loading={loading} empty="O histórico aparecerá aqui." onPublish={publishNow} onCancel={cancel} publishingId={publishingId} />
  </div>;
}

function Step({ number, title }: { number: string; title: string }) { return <div className="flex items-center gap-2"><span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold">{number}</span><h2 className="font-semibold">{title}</h2></div>; }
function MediaPreview({ url, onRemove }: { url: string; onRemove: () => void }) { return <div className="border-border bg-muted/20 relative overflow-hidden rounded-xl border">{isVideo(url) ? <video src={url} controls className="max-h-72 w-full bg-black object-contain" /> : <img src={url} alt="Pré-visualização da mídia" className="max-h-72 w-full object-contain" />}<Button type="button" size="sm" variant="destructive" className="absolute right-3 top-3" onClick={onRemove}><Trash2 className="size-3.5" /> Remover</Button></div>; }
function PostList({ title, description, posts, loading, empty, onPublish, onCancel, publishingId }: { title: string; description: string; posts: SocialPost[]; loading: boolean; empty: string; onPublish: (post: SocialPost) => void; onCancel: (post: SocialPost) => void; publishingId: string | null }) { return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{loading ? <div className="flex h-24 items-center justify-center"><Loader2 className="text-primary animate-spin" /></div> : posts.length === 0 ? <div className="text-muted-foreground border-border flex h-24 items-center justify-center rounded-lg border border-dashed text-sm">{empty}</div> : <div className="divide-border divide-y">{posts.map((post) => { const option = optionFor(post.post_type); const Icon = option.icon; const statusCanPublish = post.post_type === 'whatsapp_status_reminder' && !['published', 'cancelled', 'publishing'].includes(post.status); return <article key={post.id} className="flex flex-col gap-3 py-4 first:pt-0 md:flex-row md:items-center"><div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">{post.media_url && !isVideo(post.media_url) ? <img src={post.media_url} alt="" className="size-full object-cover" /> : <Icon className={cn('size-5', post.platform === 'whatsapp' ? 'text-emerald-500' : 'text-pink-500')} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{post.title}</p><Badge className={cn('border', STATUS_STYLE[post.status])}>{post.status === 'published' && <CheckCircle2 className="mr-1 size-3" />}{STATUS_LABEL[post.status]}</Badge></div><p className="text-muted-foreground mt-1 text-sm">{option.label} · <Clock3 className="inline size-3" /> {formatDate(post.scheduled_at)}</p>{post.caption ? <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{post.caption}</p> : null}{post.last_error ? <p className="mt-1 text-xs text-red-600">{post.last_error}</p> : null}</div><div className="flex shrink-0 gap-2">{statusCanPublish ? <Button size="sm" onClick={() => onPublish(post)} disabled={publishingId === post.id}>{publishingId === post.id ? <Loader2 className="animate-spin" /> : <Send />} Publicar agora</Button> : null}{['draft', 'scheduled', 'ready'].includes(post.status) ? <Button size="sm" variant="outline" onClick={() => onCancel(post)}>Cancelar</Button> : null}</div></article>; })}</div>}</CardContent></Card>; }

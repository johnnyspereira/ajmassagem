'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';

type Campaign = {
  id: string;
  title: string;
  summary: string;
  description: string;
  image_url: string | null;
  badge_text: string | null;
  benefit_text: string | null;
  terms: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  enrollments: {
    id: string;
    status: string;
    joined_at: string;
    contact: {
      id: string;
      name: string | null;
      phone: string;
      email: string | null;
    } | null;
  }[];
};
type Draft = {
  title: string;
  summary: string;
  description: string;
  imageUrl: string;
  badgeText: string;
  benefitText: string;
  terms: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
};
const localDate = (value = new Date()) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const emptyDraft = (): Draft => ({
  title: '',
  summary: '',
  description: '',
  imageUrl: '',
  badgeText: 'Exclusivo',
  benefitText: '',
  terms: '',
  startsAt: localDate(),
  endsAt: '',
  capacity: '',
});

export function PortalCampaignsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId, profile, canSendMessages } = useAuth();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('portal_campaigns')
      .select(
        '*,enrollments:portal_campaign_enrollments(id,status,joined_at,contact:contacts(id,name,phone,email))'
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error)
      toast.error(
        error.code === '42P01'
          ? 'Aplique a migração 106_portal_exclusive_campaigns.sql.'
          : error.message
      );
    else setItems((data ?? []) as Campaign[]);
    setLoading(false);
  }, [accountId, supabase]);
  useEffect(() => {
    // Loading follows the authenticated account becoming available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  function edit(item?: Campaign) {
    setEditing(item?.id ?? null);
    setDraft(
      item
        ? {
            title: item.title,
            summary: item.summary,
            description: item.description,
            imageUrl: item.image_url ?? '',
            badgeText: item.badge_text ?? '',
            benefitText: item.benefit_text ?? '',
            terms: item.terms ?? '',
            startsAt: localDate(new Date(item.starts_at)),
            endsAt: item.ends_at ? localDate(new Date(item.ends_at)) : '',
            capacity: item.capacity ? String(item.capacity) : '',
          }
        : emptyDraft()
    );
    setOpen(true);
  }
  async function save() {
    if (!accountId || !profile || !draft.title.trim())
      return toast.error('Indique o título da campanha.');
    setSaving(true);
    const row = {
      account_id: accountId,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      description: draft.description.trim(),
      image_url: draft.imageUrl.trim() || null,
      badge_text: draft.badgeText.trim() || null,
      benefit_text: draft.benefitText.trim() || null,
      terms: draft.terms.trim() || null,
      starts_at: new Date(draft.startsAt).toISOString(),
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      capacity: Number(draft.capacity) > 0 ? Number(draft.capacity) : null,
      created_by: profile.id,
    };
    const result = editing
      ? await supabase.from('portal_campaigns').update(row).eq('id', editing)
      : await supabase.from('portal_campaigns').insert(row);
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(
      editing ? 'Campanha atualizada.' : 'Campanha criada como rascunho.'
    );
    setOpen(false);
    await load();
  }
  async function status(item: Campaign, next: Campaign['status']) {
    const { error } = await supabase
      .from('portal_campaigns')
      .update({ status: next })
      .eq('id', item.id);
    if (error) return toast.error(error.message);
    toast.success(
      next === 'published'
        ? 'Campanha publicada no portal.'
        : 'Campanha arquivada.'
    );
    await load();
  }
  if (loading)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Megaphone /> Campanhas exclusivas
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Publique ofertas no Portal 360 e acompanhe as adesões dos clientes.
          </p>
        </div>
        {canSendMessages && (
          <Button onClick={() => edit()}>
            <Plus /> Nova campanha
          </Button>
        )}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex gap-2">
                      <Badge>
                        {item.status === 'draft'
                          ? 'Rascunho'
                          : item.status === 'published'
                            ? 'Publicada'
                            : 'Arquivada'}
                      </Badge>
                      {item.badge_text && (
                        <Badge variant="outline">{item.badge_text}</Badge>
                      )}
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {item.summary}
                    </p>
                  </div>
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="size-20 rounded-lg object-cover"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted rounded-lg p-3">
                    <Users className="mb-1 size-4" />
                    <strong>
                      {
                        item.enrollments.filter((x) => x.status !== 'cancelled')
                          .length
                      }
                    </strong>
                    <div className="text-muted-foreground text-xs">
                      adesões{item.capacity ? ` / ${item.capacity}` : ''}
                    </div>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <CalendarDays className="mb-1 size-4" />
                    <div className="text-xs">
                      {new Date(item.starts_at).toLocaleDateString('pt-PT')} —{' '}
                      {item.ends_at
                        ? new Date(item.ends_at).toLocaleDateString('pt-PT')
                        : 'sem fim'}
                    </div>
                  </div>
                </div>
                {item.enrollments.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase">
                      Clientes aderentes
                    </p>
                    {item.enrollments.slice(0, 6).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex justify-between border-t py-2 text-sm"
                      >
                        <span>
                          {entry.contact?.name ||
                            entry.contact?.phone ||
                            'Cliente'}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(entry.joined_at).toLocaleDateString(
                            'pt-PT'
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canSendMessages && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => edit(item)}
                    >
                      <Pencil /> Editar
                    </Button>
                  )}
                  {canSendMessages && item.status !== 'published' && (
                    <Button
                      size="sm"
                      onClick={() => void status(item, 'published')}
                    >
                      <Send /> Publicar
                    </Button>
                  )}
                  {canSendMessages && item.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void status(item, 'archived')}
                    >
                      <Archive /> Arquivar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="xl:col-span-2">
            <CardContent className="py-16 text-center">
              <Megaphone className="text-muted-foreground mx-auto mb-3 size-9" />
              <p className="font-medium">Ainda não existem campanhas.</p>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar campanha' : 'Nova campanha'}
            </DialogTitle>
            <DialogDescription>
              A campanha só aparece aos clientes depois de publicada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              placeholder="Título"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Input
              placeholder="Resumo curto"
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
            <Textarea
              placeholder="Descrição completa"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
            <Input
              placeholder="Benefício (ex.: 20% de desconto)"
              value={draft.benefitText}
              onChange={(e) =>
                setDraft({ ...draft, benefitText: e.target.value })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Selo: Exclusivo"
                value={draft.badgeText}
                onChange={(e) =>
                  setDraft({ ...draft, badgeText: e.target.value })
                }
              />
              <Input
                placeholder="URL da imagem"
                value={draft.imageUrl}
                onChange={(e) =>
                  setDraft({ ...draft, imageUrl: e.target.value })
                }
              />
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft({ ...draft, startsAt: e.target.value })
                }
              />
              <Input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
              <Input
                type="number"
                min="1"
                placeholder="Limite de vagas (opcional)"
                value={draft.capacity}
                onChange={(e) =>
                  setDraft({ ...draft, capacity: e.target.value })
                }
              />
            </div>
            <Textarea
              placeholder="Termos e condições"
              value={draft.terms}
              onChange={(e) => setDraft({ ...draft, terms: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type CatalogImageDraft = { file: File | null; remove: boolean };
export const emptyCatalogImage = (): CatalogImageDraft => ({
  file: null,
  remove: false,
});
export async function saveCatalogImageDraft(
  kind: string,
  id: string,
  draft: CatalogImageDraft
) {
  if (!draft.file && !draft.remove) return;
  const form = new FormData();
  form.set('kind', kind);
  form.set('id', id);
  if (draft.remove) form.set('remove', 'true');
  else if (draft.file) form.set('file', draft.file);
  const response = await fetch('/api/clinic/catalog-images', {
    method: 'POST',
    body: form,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      'O artigo foi guardado, mas a fotografia não foi guardada. ' +
        (result.error || 'Tente novamente neste formulário.')
    );
}
export function CatalogImageField({
  kind,
  id,
  draft,
  onChange,
  disabled = false,
  fallback,
}: {
  kind: 'service' | 'product' | 'pack';
  id: string | null;
  draft: CatalogImageDraft;
  onChange: (draft: CatalogImageDraft) => void;
  disabled?: boolean;
  fallback?: string | null;
}) {
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch('/api/clinic/catalog-images', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível consultar a imagem guardada.');
        const body = await response.json();
        if (!controller.signal.aborted)
          setSaved(body.images?.[`${kind}:${id}`] || '');
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [kind, id]);
  useEffect(() => {
    if (!draft.file) return;
    const url = URL.createObjectURL(draft.file);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [draft.file]);
  const src = draft.remove
    ? fallback || ''
    : draft.file
      ? preview
      : saved || fallback;
  return (
    <section
      className="bg-muted/20 space-y-3 rounded-xl border p-4"
      aria-label="Imagem do artigo no POS"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ImagePlus className="text-primary size-4" /> Fotografia do artigo
      </div>
      <p className="text-muted-foreground text-xs">
        Imagem de identificação no POS. Fica associada ao artigo quando guardar
        este formulário.
      </p>
      {src && (
        <div className="bg-muted relative aspect-[16/9] max-w-sm overflow-hidden rounded-lg">
          <Image
            src={src}
            alt="Pré-visualização do artigo"
            fill
            unoptimized
            sizes="360px"
            className="object-cover"
          />
        </div>
      )}
      <Input
        key={id || 'new'}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-label="Carregar fotografia do artigo"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (
            file &&
            (file.size > 2 * 1024 * 1024 ||
              !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
          ) {
            setError('Use JPG, PNG ou WebP até 2 MB.');
            return;
          }
          setError('');
          setPreview('');
          onChange({ file, remove: false });
        }}
      />
      <p className="text-muted-foreground text-xs">
        JPG, PNG ou WebP · até 2 MB
      </p>
      {(saved || draft.file) && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setPreview('');
            onChange({ file: null, remove: !!saved });
          }}
        >
          Remover fotografia personalizada
        </Button>
      )}
      {draft.remove && (
        <p className="text-muted-foreground text-xs">
          A fotografia personalizada será removida ao guardar.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </section>
  );
}
